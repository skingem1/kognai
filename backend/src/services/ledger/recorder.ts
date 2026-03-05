/**
 * Ledger Recorder Service
 * 
 * Handles recording of double-entry accounting transactions.
 * Ensures every transaction has balanced debits and credits.
 */

import { v4 as uuidv4 } from 'uuid';
import { Pool, PoolClient } from 'pg';
import {
  Transaction,
  TransactionEntry,
  LedgerEntry,
  RecordingResult,
  EntryDirection,
  LedgerDBClient,
} from './types';
import { getLedgerConfig } from './config';

const config = getLedgerConfig();

/**
 * Validate that debits equal credits in a transaction
 * @throws Error if transaction is not balanced
 */
export function validateBalancedTransaction(entries: TransactionEntry[]): void {
  if (!entries || entries.length === 0) {
    throw new Error('Transaction must have at least one entry');
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const entry of entries) {
    if (entry.amount <= 0) {
      throw new Error('Entry amount must be positive');
    }

    if (entry.direction === EntryDirection.DEBIT) {
      totalDebits += entry.amount;
    } else if (entry.direction === EntryDirection.CREDIT) {
      totalCredits += entry.amount;
    } else {
      throw new Error(`Invalid entry direction: ${entry.direction}`);
    }
  }

  if (totalDebits !== totalCredits) {
    throw new Error(
      `Transaction is not balanced: debits (${totalDebits}) != credits (${totalCredits})`
    );
  }
}

/**
 * Generate a unique transaction ID
 */
export function generateTransactionId(): string {
  return uuidv4();
}

/**
 * Create a ledger entry record
 */
function createLedgerEntry(
  transactionId: string,
  entry: TransactionEntry,
  balanceAfter: number
): LedgerEntry {
  return {
    id: uuidv4(),
    transaction_id: transactionId,
    account_id: entry.account_id,
    direction: entry.direction,
    amount: entry.amount,
    currency: entry.currency,
    balance_after: balanceAfter,
    created_at: new Date(),
  };
}

/**
 * Insert a transaction into the ledger
 * Uses a database transaction to ensure atomicity
 */
export async function recordTransaction(
  db: Pool | PoolClient,
  transaction: Transaction,
  client?: PoolClient
): Promise<RecordingResult> {
  // Validate transaction is balanced
  validateBalancedTransaction(transaction.entries);

  // Use the provided client or get one from the pool
  const dbClient = client || (db as Pool).connect();
  
  try {
    // Begin transaction if not already in one
    const shouldBeginTransaction = !client;
    
    if (shouldBeginTransaction) {
      await dbClient.query('BEGIN');
    }

    try {
      // Generate transaction ID if not provided
      const transactionId = transaction.id || generateTransactionId();
      const recordedEntries: LedgerEntry[] = [];

      // Calculate running balances for each account
      const accountBalances = new Map<string, number>();

      // First pass: get current balances
      for (const entry of transaction.entries) {
        if (!accountBalances.has(entry.account_id)) {
          const balanceResult = await dbClient.query<{ balance: string }>(
            `SELECT COALESCE(SUM(
              CASE 
                WHEN direction = 'DEBIT' THEN amount 
                ELSE -amount 
              END
            ), 0) as balance 
            FROM ledger_entries 
            WHERE account_id = $1`,
            [entry.account_id]
          );
          accountBalances.set(entry.account_id, parseInt(balanceResult.rows[0].balance, 10));
        }
      }

      // Second pass: insert entries and update balances
      for (const entry of transaction.entries) {
        const currentBalance = accountBalances.get(entry.account_id) || 0;
        const newBalance = entry.direction === EntryDirection.DEBIT
          ? currentBalance + entry.amount
          : currentBalance - entry.amount;

        accountBalances.set(entry.account_id, newBalance);

        const entryId = uuidv4();
        const createdAt = new Date();

        await dbClient.query(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, direction, 
            amount, currency, balance_after, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            entryId,
            transactionId,
            entry.account_id,
            entry.direction,
            entry.amount,
            entry.currency,
            newBalance,
            transaction.metadata ? JSON.stringify(transaction.metadata) : null,
            createdAt,
          ]
        );

        recordedEntries.push(
          createLedgerEntry(transactionId, entry, newBalance)
        );
      }

      // Commit transaction
      if (shouldBeginTransaction) {
        await dbClient.query('COMMIT');
      }

      return {
        transaction_id: transactionId,
        entries: recordedEntries,
        recorded_at: new Date(),
      };
    } catch (error) {
      // Rollback on error
      if (shouldBeginTransaction) {
        await dbClient.query('ROLLBACK');
      }
      throw error;
    }
  } finally {
    // Release client if we created it
    if (!client && (dbClient as PoolClient).release) {
      (dbClient as PoolClient).release();
    }
  }
}

/**
 * Record a simple transfer between two accounts
 * Convenience function for common transfer scenarios
 */
export async function recordTransfer(
  db: Pool | PoolClient,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  description: string,
  currency: string = 'USD',
  metadata?: Record<string, unknown>
): Promise<RecordingResult> {
  const transaction: Transaction = {
    id: generateTransactionId(),
    description,
    entries: [
      {
        account_id: fromAccountId,
        direction: EntryDirection.CREDIT,
        amount,
        currency,
      },
      {
        account_id: toAccountId,
        direction: EntryDirection.DEBIT,
        amount,
        currency,
      },
    ],
    metadata,
  };

  return recordTransaction(db, transaction);
}

/**
 * Record an expense transaction
 * Convenience function for common expense scenarios
 */
export async function recordExpense(
  db: Pool | PoolClient,
  expenseAccountId: string,
  paymentAccountId: string,
  amount: number,
  description: string,
  currency: string = 'USD',
  metadata?: Record<string, unknown>
): Promise<RecordingResult> {
  // In expense accounting:
  // - Expense account gets debited (increases)
  // - Payment account gets credited (decreases)
  return recordTransfer(db, paymentAccountId, expenseAccountId, amount, description, currency, metadata);
}

/**
 * Record a revenue transaction
 * Convenience function for common revenue scenarios
 */
export async function recordRevenue(
  db: Pool | PoolClient,
  revenueAccountId: string,
  receiveAccountId: string,
  amount: number,
  description: string,
  currency: string = 'USD',
  metadata?: Record<string, unknown>
): Promise<RecordingResult> {
  // In revenue accounting:
  // - Revenue account gets credited (increases)
  // - Receive account gets debited (increases)
  return recordTransfer(db, receiveAccountId, revenueAccountId, amount, description, currency, metadata);
}

/**
 * Check if a transaction is idempotent using an idempotency key
 */
export async function isTransactionIdempotent(
  db: Pool | PoolClient,
  idempotencyKey: string
): Promise<RecordingResult | null> {
  const result = await (db as Pool).query<{
    transaction_id: string;
    entries: string;
    created_at: Date;
  }>(
    `SELECT te.transaction_id, json_agg(
      json_build_object(
        'id', le.id,
        'transaction_id', le.transaction_id,
        'account_id', le.account_id,
        'direction', le.direction,
        'amount', le.amount,
        'currency', le.currency,
        'balance_after', le.balance_after,
        'created_at', le.created_at
      )
    ) as entries,
    MIN(le.created_at) as created_at
    FROM ledger_entries le
    JOIN transactions te ON te.id = le.transaction_id
    WHERE te.idempotency_key = $1
    GROUP BY te.transaction_id`,
    [idempotencyKey]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    transaction_id: row.transaction_id,
    entries: JSON.parse(row.entries as unknown as string),
    recorded_at: row.created_at,
  };
}
