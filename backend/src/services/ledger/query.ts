/**
 * Ledger Query Service
 * 
 * Provides high-performance queries for ledger entries using TimescaleDB.
 * Supports time-series queries, balance queries, and account lookups.
 */

import { Pool, PoolClient } from 'pg';
import {
  LedgerEntry,
  LedgerQueryFilters,
  BalanceResult,
  EntryDirection,
  Account,
  AccountType,
} from './types';

/**
 * Get ledger entries with flexible filtering
 * Optimized for TimescaleDB time-series queries
 */
export async function queryLedgerEntries(
  db: Pool | PoolClient,
  filters: LedgerQueryFilters
): Promise<LedgerEntry[]> {
  const conditions: string[] = [];
  const params: (string | number | Date)[] = [];
  let paramIndex = 1;

  // Build WHERE conditions
  if (filters.account_id) {
    conditions.push(`le.account_id = $${paramIndex++}`);
    params.push(filters.account_id);
  }

  if (filters.agent_id) {
    conditions.push(`a.agent_id = $${paramIndex++}`);
    params.push(filters.agent_id);
  }

  if (filters.team_id) {
    conditions.push(`a.team_id = $${paramIndex++}`);
    params.push(filters.team_id);
  }

  if (filters.department_id) {
    conditions.push(`a.department_id = $${paramIndex++}`);
    params.push(filters.department_id);
  }

  if (filters.start_date) {
    conditions.push(`le.created_at >= $${paramIndex++}`);
    params.push(filters.start_date);
  }

  if (filters.end_date) {
    conditions.push(`le.created_at <= $${paramIndex++}`);
    params.push(filters.end_date);
  }

  if (filters.direction) {
    conditions.push(`le.direction = $${paramIndex++}`);
    params.push(filters.direction);
  }

  if (filters.min_amount !== undefined) {
    conditions.push(`le.amount >= $${paramIndex++}`);
    params.push(filters.min_amount);
  }

  if (filters.max_amount !== undefined) {
    conditions.push(`le.amount <= $${paramIndex++}`);
    params.push(filters.max_amount);
  }

  // Build query with optional joins for hierarchy
  let query = `
    SELECT le.id, le.transaction_id, le.account_id, le.direction,
           le.amount, le.currency, le.balance_after, le.metadata, le.created_at
    FROM ledger_entries le
  `;

  // Join with accounts table if filtering by hierarchy
  if (filters.agent_id || filters.team_id || filters.department_id) {
    query += `
      JOIN accounts a ON le.account_id = a.id
    `;
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  // Add ordering (most recent first for time-series)
  query += ` ORDER BY le.created_at DESC`;

  // Add pagination
  if (filters.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(filters.limit);
  }

  if (filters.offset) {
    query += ` OFFSET $${paramIndex++}`;
    params.push(filters.offset);
  }

  const result = await db.query<LedgerEntry>(query, params);
  return result.rows;
}

/**
 * Get the current balance for an account
 */
export async function getAccountBalance(
  db: Pool | PoolClient,
  accountId: string,
  asOf: Date = new Date()
): Promise<BalanceResult> {
  const result = await db.query<{ balance: string; currency: string }>(
    `SELECT COALESCE(SUM(
      CASE 
        WHEN direction = 'DEBIT' THEN amount 
        ELSE -amount 
      END
    ), 0) as balance, 
    COALESCE(MAX(currency), 'USD') as currency
    FROM ledger_entries 
    WHERE account_id = $1 AND created_at <= $2`,
    [accountId, asOf]
  );

  return {
    account_id: accountId,
    balance: parseInt(result.rows[0].balance, 10),
    currency: result.rows[0].currency,
    as_of: asOf,
  };
}

/**
 * Get balances for multiple accounts
 */
export async function getAccountBalances(
  db: Pool | PoolClient,
  accountIds: string[],
  asOf: Date = new Date()
): Promise<BalanceResult[]> {
  if (accountIds.length === 0) {
    return [];
  }

  const result = await db.query<{ account_id: string; balance: string; currency: string }>(
    `SELECT account_id, 
            COALESCE(SUM(
              CASE 
                WHEN direction = 'DEBIT' THEN amount 
                ELSE -amount 
              END
            ), 0) as balance,
            COALESCE(MAX(currency), 'USD') as currency
     FROM ledger_entries 
     WHERE account_id = ANY($1) AND created_at <= $2
     GROUP BY account_id`,
    [accountIds, asOf]
  );

  return result.rows.map(row => ({
    account_id: row.account_id,
    balance: parseInt(row.balance, 10),
    currency: row.currency,
    as_of: asOf,
  }));
}

/**
 * Get account by ID
 */
export async function getAccount(
  db: Pool | PoolClient,
  accountId: string
): Promise<Account | null> {
  const result = await db.query<Account>(
    `SELECT id, name, type, description, agent_id, team_id, department_id, 
            created_at, updated_at
     FROM accounts 
     WHERE id = $1`,
    [accountId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Get accounts by type
 */
export async function getAccountsByType(
  db: Pool | PoolClient,
  type: AccountType
): Promise<Account[]> {
  const result = await db.query<Account>(
    `SELECT id, name, type, description, agent_id, team_id, department_id,
            created_at, updated_at
     FROM accounts 
     WHERE type = $1
     ORDER BY name`,
    [type]
  );

  return result.rows;
}

/**
 * Get accounts by hierarchy
 */
export async function getAccountsByHierarchy(
  db: Pool | PoolClient,
  hierarchy: {
    agent_id?: string;
    team_id?: string;
    department_id?: string;
  }
): Promise<Account[]> {
  const conditions: string[] = [];
  const params: string[] = [];
  let paramIndex = 1;

  if (hierarchy.agent_id) {
    conditions.push(`agent_id = $${paramIndex++}`);
    params.push(hierarchy.agent_id);
  }

  if (hierarchy.team_id) {
    conditions.push(`team_id = $${paramIndex++}`);
    params.push(hierarchy.team_id);
  }

  if (hierarchy.department_id) {
    conditions.push(`department_id = $${paramIndex++}`);
    params.push(hierarchy.department_id);
  }

  const query = conditions.length > 0
    ? `SELECT id, name, type, description, agent_id, team_id, department_id,
              created_at, updated_at
       FROM accounts 
       WHERE ${conditions.join(' AND ')}
       ORDER BY name`
    : `SELECT id, name, type, description, agent_id, team_id, department_id,
              created_at, updated_at
       FROM accounts 
       ORDER BY name`;

  const result = await db.query<Account>(query, params);
  return result.rows;
}

/**
 * Get transaction entries
 */
export async function getTransactionEntries(
  db: Pool | PoolClient,
  transactionId: string
): Promise<LedgerEntry[]> {
  const result = await db.query<LedgerEntry>(
    `SELECT id, transaction_id, account_id, direction,
            amount, currency, balance_after, metadata, created_at
     FROM ledger_entries 
     WHERE transaction_id = $1
     ORDER BY created_at`,
    [transactionId]
  );

  return result.rows;
}

/**
 * Get time-series data for an account within a time range
 * Optimized for TimescaleDB time_bucket queries
 */
export async function getTimeSeriesBalances(
  db: Pool | PoolClient,
  accountId: string,
  startDate: Date,
  endDate: Date,
  interval: string = '1 day'
): Promise<{ time_bucket: Date; balance: number }[]> {
  const result = await db.query<{ time_bucket: Date; balance: string }>(
    `SELECT time_bucket($1, created_at) as time_bucket,
            SUM(CASE 
                WHEN direction = 'DEBIT' THEN amount 
                ELSE -amount 
            END) as balance
     FROM ledger_entries
     WHERE account_id = $2 
       AND created_at >= $3 
       AND created_at <= $4
     GROUP BY time_bucket
     ORDER BY time_bucket`,
    [interval, accountId, startDate, endDate]
  );

  return result.rows.map(row => ({
    time_bucket: row.time_bucket,
    balance: parseInt(row.balance, 10),
  }));
}

/**
 * Get aggregate statistics for an account
 */
export async function getAccountStats(
  db: Pool | PoolClient,
  accountId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  total_debits: number;
  total_credits: number;
  transaction_count: number;
  average_amount: number;
}> {
  let query = `
    SELECT 
      COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
      COUNT(DISTINCT transaction_id) as transaction_count,
      COALESCE(AVG(amount), 0) as average_amount
    FROM ledger_entries
    WHERE account_id = $1
  `;

  const params: (string | Date)[] = [accountId];
  let paramIndex = 2;

  if (startDate) {
    query += ` AND created_at >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND created_at <= $${paramIndex++}`;
    params.push(endDate);
  }

  const result = await db.query<{
    total_debits: string;
    total_credits: string;
    transaction_count: string;
    average_amount: string;
  }>(query, params);

  const row = result.rows[0];
  return {
    total_debits: parseInt(row.total_debits, 10),
    total_credits: parseInt(row.total_credits, 10),
    transaction_count: parseInt(row.transaction_count, 10),
    average_amount: parseInt(row.average_amount, 10),
  };
}

/**
 * Create an account
 */
export async function createAccount(
  db: Pool | PoolClient,
  name: string,
  type: AccountType,
  options?: {
    description?: string;
    agent_id?: string;
    team_id?: string;
    department_id?: string;
  }
): Promise<Account> {
  const result = await db.query<Account>(
    `INSERT INTO accounts (name, type, description, agent_id, team_id, department_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, type, description, agent_id, team_id, department_id, 
               created_at, updated_at`,
    [
      name,
      type,
      options?.description || null,
      options?.agent_id || null,
      options?.team_id || null,
      options?.department_id || null,
    ]
  );

  return result.rows[0];
}

/**
 * Get ledger entries grouped by account
 * Useful for reconciliation
 */
export async function getEntriesGroupedByAccount(
  db: Pool | PoolClient,
  filters: LedgerQueryFilters
): Promise<Map<string, LedgerEntry[]>> {
  const entries = await queryLedgerEntries(db, { ...filters, limit: 10000 });
  
  const grouped = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.account_id) || [];
    existing.push(entry);
    grouped.set(entry.account_id, existing);
  }

  return grouped;
}
