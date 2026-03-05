/**
 * Budget Service
 * 
 * Manages budget allocation, tracking, and spending for agents,
 * teams, and departments in a hierarchical structure.
 */

import { v4 as uuidv4 } from 'uuid';
import { Pool, PoolClient } from 'pg';
import {
  Budget,
  BudgetLevel,
  BudgetCheckResult,
  BudgetReservation,
  HierarchyPath,
  LedgerDBClient,
} from './types';
import { getLedgerConfig } from './config';

const config = getLedgerConfig();

/**
 * Get the database client
 * Handles both Pool and PoolClient scenarios
 */
function getDbClient(db: Pool | PoolClient): PoolClient {
  if ('query' in db) {
    return (db as Pool).connect() as Promise<PoolClient>;
  }
  return db as PoolClient;
}

/**
 * Get budget for a specific level and ID
 */
export async function getBudget(
  db: Pool | PoolClient,
  level: BudgetLevel,
  levelId: string,
  asOf: Date = new Date()
): Promise<Budget | null> {
  const result = await db.query<Budget>(
    `SELECT id, level, level_id, total_amount, spent_amount, reserved_amount, 
            currency, period_start, period_end, version, created_at, updated_at
     FROM budgets 
     WHERE level = $1 AND level_id = $2 
     AND period_start <= $3 AND period_end >= $3
     LIMIT 1`,
    [level, levelId, asOf]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Get budgets for all levels in a hierarchy path
 */
export async function getHierarchyBudgets(
  db: Pool | PoolClient,
  hierarchy: HierarchyPath,
  asOf: Date = new Date()
): Promise<Budget[]> {
  const budgets: Budget[] = [];
  const params: (string | Date)[] = [asOf];
  let paramIndex = 2;

  // Build query based on available hierarchy levels
  const conditions: string[] = ['period_start <= $1', 'period_end >= $1'];

  if (hierarchy.agent_id) {
    conditions.push(`(level = $${paramIndex} AND level_id = $${paramIndex})`);
    params.push(hierarchy.agent_id);
    paramIndex++;
  }
  if (hierarchy.team_id) {
    conditions.push(`(level = $${paramIndex} AND level_id = $${paramIndex})`);
    params.push(hierarchy.team_id);
    paramIndex++;
  }
  if (hierarchy.department_id) {
    conditions.push(`(level = $${paramIndex} AND level_id = $${paramIndex})`);
    params.push(hierarchy.department_id);
  }

  const query = `
    SELECT id, level, level_id, total_amount, spent_amount, reserved_amount,
           currency, period_start, period_end, version, created_at, updated_at
    FROM budgets
    WHERE ${conditions.join(' OR ')}
    ORDER BY 
      CASE level
        WHEN 'DEPARTMENT' THEN 1
        WHEN 'TEAM' THEN 2
        WHEN 'AGENT' THEN 3
      END
  `;

  const result = await db.query<Budget>(query, params);
  return result.rows;
}

/**
 * Get budget with check against hierarchical limits
 * Checks agent -> team -> department in order
 */
export async function getAgentBudget(
  db: Pool | PoolClient,
  hierarchy: HierarchyPath
): Promise<{
  agent?: Budget;
  team?: Budget;
  department?: Budget;
}> {
  const budgets = await getHierarchyBudgets(db, hierarchy);

  return {
    agent: budgets.find(b => b.level === BudgetLevel.AGENT),
    team: budgets.find(b => b.level === BudgetLevel.TEAM),
    department: budgets.find(b => b.level === BudgetLevel.DEPARTMENT),
  };
}

/**
 * Update spent amount on a budget with optimistic locking
 */
export async function updateSpentAmount(
  db: Pool | PoolClient,
  budgetId: string,
  amount: number,
  expectedVersion: number
): Promise<Budget> {
  const result = await db.query<Budget>(
    `UPDATE budgets 
     SET spent_amount = spent_amount + $1, 
         version = version + 1,
         updated_at = NOW()
     WHERE id = $2 AND version = $3
     RETURNING id, level, level_id, total_amount, spent_amount, reserved_amount,
               currency, period_start, period_end, version, created_at, updated_at`,
    [amount, budgetId, expectedVersion]
  );

  if (result.rows.length === 0) {
    throw new Error(`Budget update failed: version mismatch or budget not found (id: ${budgetId})`);
  }

  return result.rows[0];
}

/**
 * Check if a spend is allowed at a specific budget level
 */
export async function checkBudget(
  db: Pool | PoolClient,
  level: BudgetLevel,
  levelId: string,
  amount: number,
  asOf: Date = new Date()
): Promise<BudgetCheckResult> {
  const budget = await getBudget(db, level, levelId, asOf);

  if (!budget) {
    return {
      allowed: false,
      remaining: 0,
      reserved: 0,
      spent: 0,
      total: 0,
      budget_id: '',
      level,
      reasons: [`No budget found for ${level} ${levelId}`],
    };
  }

  const available = budget.total_amount - budget.spent_amount - budget.reserved_amount;
  const allowed = available >= amount;

  return {
    allowed,
    remaining: available,
    reserved: budget.reserved_amount,
    spent: budget.spent_amount,
    total: budget.total_amount,
    budget_id: budget.id,
    level,
    reasons: allowed ? undefined : [
      `Insufficient budget: available (${available}) < requested (${amount})`,
    ],
  };
}

/**
 * Create a budget reservation with expiry
 */
export async function createBudgetReservation(
  db: Pool | PoolClient,
  budgetId: string,
  amount: number,
  agentId: string,
  currency: string
): Promise<BudgetReservation> {
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + config.reservationExpirySeconds);

  const reservation: BudgetReservation = {
    id: uuidv4(),
    budget_id: budgetId,
    amount,
    currency,
    agent_id: agentId,
    expires_at: expiresAt,
    created_at: new Date(),
  };

  // First, reserve the amount in the budget
  await db.query(
    `UPDATE budgets 
     SET reserved_amount = reserved_amount + $1,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [amount, budgetId]
  );

  // Then create the reservation record
  await db.query(
    `INSERT INTO budget_reservations (
      id, budget_id, amount, currency, agent_id, expires_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      reservation.id,
      reservation.budget_id,
      reservation.amount,
      reservation.currency,
      reservation.agent_id,
      reservation.expires_at,
      reservation.created_at,
    ]
  );

  return reservation;
}

/**
 * Cancel a budget reservation
 */
export async function cancelBudgetReservation(
  db: Pool | PoolClient,
  reservationId: string
): Promise<void> {
  // Get the reservation
  const reservationResult = await db.query<BudgetReservation>(
    `SELECT * FROM budget_reservations WHERE id = $1`,
    [reservationId]
  );

  if (reservationResult.rows.length === 0) {
    throw new Error(`Reservation not found: ${reservationId}`);
  }

  const reservation = reservationResult.rows[0];

  // Release the reserved amount
  await db.query(
    `UPDATE budgets 
     SET reserved_amount = reserved_amount - $1,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [reservation.amount, reservation.budget_id]
  );

  // Delete the reservation
  await db.query(`DELETE FROM budget_reservations WHERE id = $1`, [reservationId]);
}

/**
 * Convert a reservation to actual spending
 */
export async function consumeBudgetReservation(
  db: Pool | PoolClient,
  reservationId: string
): Promise<void> {
  // Get the reservation
  const reservationResult = await db.query<BudgetReservation>(
    `SELECT * FROM budget_reservations WHERE id = $1`,
    [reservationId]
  );

  if (reservationResult.rows.length === 0) {
    throw new Error(`Reservation not found: ${reservationId}`);
  }

  const reservation = reservationResult.rows[0];

  // Move from reserved to spent
  await db.query(
    `UPDATE budgets 
     SET spent_amount = spent_amount + $1,
         reserved_amount = reserved_amount - $1,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [reservation.amount, reservation.budget_id]
  );

  // Delete the reservation
  await db.query(`DELETE FROM budget_reservations WHERE id = $1`, [reservationId]);
}

/**
 * Clean up expired reservations
 * Should be called periodically to release unclaimed reservations
 */
export async function cleanupExpiredReservations(db: Pool | PoolClient): Promise<number> {
  // Get expired reservations
  const expiredResult = await db.query<BudgetReservation>(
    `SELECT * FROM budget_reservations WHERE expires_at < NOW()`,
  );

  if (expiredResult.rows.length === 0) {
    return 0;
  }

  // Group by budget to update correctly
  const budgetAmounts = new Map<string, number>();
  for (const reservation of expiredResult.rows) {
    const current = budgetAmounts.get(reservation.budget_id) || 0;
    budgetAmounts.set(reservation.budget_id, current + reservation.amount);
  }

  // Update budgets to release reserved amounts
  for (const [budgetId, amount] of budgetAmounts) {
    await db.query(
      `UPDATE budgets 
       SET reserved_amount = reserved_amount - $1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, budgetId]
    );
  }

  // Delete expired reservations
  await db.query(`DELETE FROM budget_reservations WHERE expires_at < NOW()`);

  return expiredResult.rows.length;
}

/**
 * Create a new budget
 */
export async function createBudget(
  db: Pool | PoolClient,
  level: BudgetLevel,
  levelId: string,
  totalAmount: number,
  currency: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Budget> {
  const budget: Budget = {
    id: uuidv4(),
    level,
    level_id: levelId,
    total_amount: totalAmount,
    spent_amount: 0,
    reserved_amount: 0,
    currency,
    period_start: periodStart,
    period_end: periodEnd,
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.query<Budget>(
    `INSERT INTO budgets (
      id, level, level_id, total_amount, spent_amount, reserved_amount,
      currency, period_start, period_end, version, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, level, level_id, total_amount, spent_amount, reserved_amount,
               currency, period_start, period_end, version, created_at, updated_at`,
    [
      budget.id,
      budget.level,
      budget.level_id,
      budget.total_amount,
      budget.spent_amount,
      budget.reserved_amount,
      budget.currency,
      budget.period_start,
      budget.period_end,
      budget.version,
      budget.created_at,
      budget.updated_at,
    ]
  );

  return result.rows[0];
}
