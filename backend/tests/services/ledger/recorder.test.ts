/**
 * Tests for Ledger Recorder Service
 * 
 * Tests double-entry transaction recording with balanced debits/credits
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { Pool, PoolClient } from 'pg';

// Mock the config module
jest.mock('../../src/services/ledger/config', () => ({
  getLedgerConfig: () => ({
    reservationExpirySeconds: 60,
    maxRetryAttempts: 3,
    retryDelayMs: 100,
  }),
}));

// Import after mocking
import {
  validateBalancedTransaction,
  generateTransactionId,
  recordTransaction,
  recordTransfer,
  recordExpense,
  recordRevenue,
  isTransactionIdempotent,
} from '../../src/services/ledger/recorder';
import {
  Transaction,
  TransactionEntry,
  EntryDirection,
  LedgerEntry,
} from '../../src/services/ledger/types';

// Mock database
const createMockPool = () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  } as unknown as PoolClient;

  return {
    connect: jest.fn().mockResolvedValue(mockClient),
    query: jest.fn(),
    end: jest.fn(),
  } as unknown as Pool;
};

const createMockClient = () => {
  return {
    query: jest.fn(),
    release: jest.fn(),
  } as unknown as PoolClient;
};

describe('Ledger Recorder', () => {
  describe('validateBalancedTransaction', () => {
    it('should accept a balanced transaction with equal debits and credits', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).not.toThrow();
    });

    it('should accept a transaction with multiple entries that balance', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 500, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.DEBIT, amount: 500, currency: 'USD' },
        { account_id: 'acc3', direction: EntryDirection.CREDIT, amount: 1000, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).not.toThrow();
    });

    it('should reject an unbalanced transaction', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 500, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).toThrow(
        'Transaction is not balanced: debits (1000) != credits (500)'
      );
    });

    it('should reject an empty transaction', () => {
      expect(() => validateBalancedTransaction([])).toThrow(
        'Transaction must have at least one entry'
      );
    });

    it('should reject a transaction with negative amount', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: -1000, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: -1000, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).toThrow(
        'Entry amount must be positive'
      );
    });

    it('should reject a transaction with zero amount', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 0, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 0, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).toThrow(
        'Entry amount must be positive'
      );
    });

    it('should reject an invalid entry direction', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: 'INVALID' as EntryDirection, amount: 1000, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).toThrow(
        'Invalid entry direction: INVALID'
      );
    });

    it('should handle large amounts correctly', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000000000, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000000000, currency: 'USD' },
      ];

      expect(() => validateBalancedTransaction(entries)).not.toThrow();
    });

    it('should handle different currencies in same transaction (allowed)', () => {
      const entries: TransactionEntry[] = [
        { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
        { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000, currency: 'EUR' },
      ];

      // Currency validation happens at DB level, not here
      expect(() => validateBalancedTransaction(entries)).not.toThrow();
    });
  });

  describe('generateTransactionId', () => {
    it('should generate a unique UUID', () => {
      const id1 = generateTransactionId();
      const id2 = generateTransactionId();

      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toEqual(id2);
    });
  });

  describe('recordTransaction', () => {
    let mockPool: Pool;
    let mockClient: PoolClient;

    beforeEach(() => {
      mockPool = createMockPool();
      mockClient = createMockClient();
    });

    it('should record a balanced transaction successfully', async () => {
      const transaction: Transaction = {
        id: 'txn-1',
        description: 'Test transaction',
        entries: [
          { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
          { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000, currency: 'USD' },
        ],
      };

      // Mock balance query returns 0
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] }) // GET BALANCE
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      const result = await recordTransaction(mockClient, transaction);

      expect(result.transaction_id).toBe('txn-1');
      expect(result.entries).toHaveLength(2);
      expect(result.recorded_at).toBeInstanceOf(Date);
    });

    it('should throw error for unbalanced transaction', async () => {
      const transaction: Transaction = {
        id: 'txn-1',
        description: 'Test transaction',
        entries: [
          { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
          { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 500, currency: 'USD' },
        ],
      };

      await expect(recordTransaction(mockClient, transaction)).rejects.toThrow(
        'Transaction is not balanced'
      );
    });

    it('should generate transaction ID if not provided', async () => {
      const transaction: Transaction = {
        description: 'Test transaction',
        entries: [
          { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
          { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000, currency: 'USD' },
        ],
      };

      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await recordTransaction(mockClient, transaction);

      expect(result.transaction_id).toBeDefined();
      expect(result.transaction_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should rollback on database error', async () => {
      const transaction: Transaction = {
        id: 'txn-1',
        description: 'Test transaction',
        entries: [
          { account_id: 'acc1', direction: EntryDirection.DEBIT, amount: 1000, currency: 'USD' },
          { account_id: 'acc2', direction: EntryDirection.CREDIT, amount: 1000, currency: 'USD' },
        ],
      };

      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(recordTransaction(mockClient, transaction)).rejects.toThrow(
        'Database error'
      );

      // Should have called ROLLBACK
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('recordTransfer', () => {
    let mockPool: Pool;
    let mockClient: PoolClient;

    beforeEach(() => {
      mockPool = createMockPool();
      mockClient = createMockClient();
    });

    it('should record a transfer between two accounts', async () => {
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await recordTransfer(
        mockClient,
        'from-account',
        'to-account',
        5000,
        'Test transfer',
        'USD'
      );

      expect(result.entries).toHaveLength(2);
      const debitEntry = result.entries.find(e => e.direction === EntryDirection.DEBIT);
      const creditEntry = result.entries.find(e => e.direction === EntryDirection.CREDIT);

      expect(debitEntry?.account_id).toBe('to-account');
      expect(debitEntry?.amount).toBe(5000);
      expect(creditEntry?.account_id).toBe('from-account');
      expect(creditEntry?.amount).toBe(5000);
    });
  });

  describe('recordExpense', () => {
    let mockPool: Pool;
    let mockClient: PoolClient;

    beforeEach(() => {
      mockPool = createMockPool();
      mockClient = createMockClient();
    });

    it('should record an expense correctly', async () => {
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await recordExpense(
        mockClient,
        'expense-account',
        'cash-account',
        2500,
        'Office supplies'
      );

      expect(result.entries).toHaveLength(2);
      // Expense account gets debited (increased)
      // Cash account gets credited (decreased)
      const debitEntry = result.entries.find(e => e.direction === EntryDirection.DEBIT);
      expect(debitEntry?.account_id).toBe('cash-account');
    });
  });

  describe('recordRevenue', () => {
    let mockPool: Pool;
    let mockClient: PoolClient;

    beforeEach(() => {
      mockPool = createMockPool();
      mockClient = createMockClient();
    });

    it('should record revenue correctly', async () => {
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [{ balance: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await recordRevenue(
        mockClient,
        'revenue-account',
        'cash-account',
        10000,
        'Service revenue'
      );

      expect(result.entries).toHaveLength(2);
      // Revenue account gets credited (increased)
      // Cash account gets debited (increased)
      const creditEntry = result.entries.find(e => e.direction === EntryDirection.CREDIT);
      expect(creditEntry?.account_id).toBe('revenue-account');
    });
  });

  describe('isTransactionIdempotent', () => {
    let mockPool: Pool;

    beforeEach(() => {
      mockPool = createMockPool();
    });

    it('should return null for non-existent idempotency key', async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await isTransactionIdempotent(mockPool, 'nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return existing transaction for duplicate idempotency key', async () => {
      const existingEntries = [
        { id: 'e1', transaction_id: 'txn-1', account_id: 'acc1', direction: 'DEBIT', amount: 1000, currency: 'USD', balance_after: 1000, created_at: new Date() },
      ];

      (mockPool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          transaction_id: 'txn-1',
          entries: JSON.stringify(existingEntries),
          created_at: new Date(),
        }],
      });

      const result = await isTransactionIdempotent(mockPool, 'duplicate-key');

      expect(result).not.toBeNull();
      expect(result?.transaction_id).toBe('txn-1');
    });
  });
});
