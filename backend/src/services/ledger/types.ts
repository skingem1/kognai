/**
 * Ledger Service Type Definitions
 * 
 * Provides type-safe interfaces for double-entry accounting,
 * budget management, and hierarchical enforcement.
 */

import { PoolClient } from 'pg';

/**
 * Account types supported in the ledger
 */
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

/**
 * Direction of the entry (debit or credit)
 */
export enum EntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Account represents a ledger account
 */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  description?: string;
  agent_id?: string;
  team_id?: string;
  department_id?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * A single line item in a transaction
 */
export interface TransactionEntry {
  account_id: string;
  direction: EntryDirection;
  amount: number; // Stored in cents to avoid floating point issues
  currency: string;
}

/**
 * A complete transaction with multiple entries
 */
export interface Transaction {
  id: string;
  description: string;
  entries: TransactionEntry[];
  metadata?: Record<string, unknown>;
  created_at: Date;
  idempotency_key?: string;
}

/**
 * Ledger entry as stored in the database
 */
export interface LedgerEntry {
  id: string;
  transaction_id: string;
  account_id: string;
  direction: EntryDirection;
  amount: number;
  currency: string;
  balance_after: number;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

/**
 * Budget hierarchy levels
 */
export enum BudgetLevel {
  AGENT = 'AGENT',
  TEAM = 'TEAM',
  DEPARTMENT = 'DEPARTMENT',
}

/**
 * Budget definition
 */
export interface Budget {
  id: string;
  level: BudgetLevel;
  level_id: string; // agent_id, team_id, or department_id
  total_amount: number;
  spent_amount: number;
  reserved_amount: number;
  currency: string;
  period_start: Date;
  period_end: Date;
  version: number; // For optimistic locking
  created_at: Date;
  updated_at: Date;
}

/**
 * Budget reservation with expiry
 */
export interface BudgetReservation {
  id: string;
  budget_id: string;
  amount: number;
  currency: string;
  agent_id: string;
  expires_at: Date;
  created_at: Date;
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  reserved: number;
  spent: number;
  total: number;
  budget_id: string;
  level: BudgetLevel;
  reasons?: string[];
}

/**
 * Transaction recording result
 */
export interface RecordingResult {
  transaction_id: string;
  entries: LedgerEntry[];
  recorded_at: Date;
}

/**
 * Query filters for ledger entries
 */
export interface LedgerQueryFilters {
  account_id?: string;
  agent_id?: string;
  team_id?: string;
  department_id?: string;
  start_date?: Date;
  end_date?: Date;
  direction?: EntryDirection;
  min_amount?: number;
  max_amount?: number;
  limit?: number;
  offset?: number;
}

/**
 * Balance query result
 */
export interface BalanceResult {
  account_id: string;
  balance: number;
  currency: string;
  as_of: Date;
}

/**
 * Hierarchy path for budget enforcement
 */
export interface HierarchyPath {
  agent_id?: string;
  team_id?: string;
  department_id?: string;
}

/**
 * Database transaction helper type
 */
export type LedgerDBClient = PoolClient;

/**
 * Configuration for ledger service
 */
export interface LedgerConfig {
  reservationExpirySeconds: number;
  maxRetryAttempts: number;
  retryDelayMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_LEDGER_CONFIG: LedgerConfig = {
  reservationExpirySeconds: 60,
  maxRetryAttempts: 3,
  retryDelayMs: 100,
};
