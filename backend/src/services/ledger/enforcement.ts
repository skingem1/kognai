/**
 * Budget Enforcement Service
 * 
 * Provides hierarchical budget enforcement with optimistic locking.
 * Checks budgets at agent -> team -> department level in order.
 */

import { Pool, PoolClient } from 'pg';
import {
  Budget,
  BudgetLevel,
  BudgetCheckResult,
  BudgetReservation,
  HierarchyPath,
  LedgerDBClient,
} from './types';
import * as budget from './budget';
import { getLedgerConfig, LedgerConfig } from './config';

const config = getLedgerConfig();

/**
 * Result of hierarchical budget enforcement check
 */
export interface EnforcementResult {
  allowed: boolean;
  level: BudgetLevel;
  budget_id: string;
  remaining: number;
  spent: number;
  reserved: number;
  total: number;
  reasons: string[];
  applicable_budgets: BudgetCheckResult[];
}

/**
 * Check hierarchical budgets in order: agent -> team -> department
 * 
 * @param db - Database connection
 * @param hierarchy - The hierarchy path (agent, team, department)
 * @param amount - Amount to check
 * @param skipLevels - Levels to skip in the check
 * @returns EnforcementResult with the check results
 */
export async function checkHierarchicalBudget(
  db: Pool | PoolClient,
  hierarchy: HierarchyPath,
  amount: number,
  skipLevels: BudgetLevel[] = []
): Promise<EnforcementResult> {
  const applicableBudgets: BudgetCheckResult[] = [];
  let finalDecision = true;
  const reasons: string[] = [];

  // Check in order: department -> team -> agent
  // Start with highest level (department) and work down
  
  // Check department first (root of hierarchy)
  if (hierarchy.department_id && !skipLevels.includes(BudgetLevel.DEPARTMENT)) {
    const deptCheck = await budget.checkBudget(
      db,
      BudgetLevel.DEPARTMENT,
      hierarchy.department_id,
      amount
    );
    applicableBudgets.push(deptCheck);
    
    if (!deptCheck.allowed) {
      finalDecision = false;
      reasons.push(`Department budget exceeded: ${deptCheck.reasons?.join(', ')}`);
    }
  }

  // Check team level
  if (hierarchy.team_id && !skipLevels.includes(BudgetLevel.TEAM)) {
    const teamCheck = await budget.checkBudget(
      db,
      BudgetLevel.TEAM,
      hierarchy.team_id,
      amount
    );
    applicableBudgets.push(teamCheck);
    
    if (!teamCheck.allowed) {
      finalDecision = false;
      reasons.push(`Team budget exceeded: ${teamCheck.reasons?.join(', ')}`);
    }
  }

  // Check agent level (most specific)
  if (hierarchy.agent_id && !skipLevels.includes(BudgetLevel.AGENT)) {
    const agentCheck = await budget.checkBudget(
      db,
      BudgetLevel.AGENT,
      hierarchy.agent_id,
      amount
    );
    applicableBudgets.push(agentCheck);
    
    if (!agentCheck.allowed) {
      finalDecision = false;
      reasons.push(`Agent budget exceeded: ${agentCheck.reasons?.join(', ')}`);
    }
  }

  // Determine which budget level was the deciding factor
  let decidingLevel = BudgetLevel.AGENT;
  let decidingBudget: BudgetCheckResult | undefined;
  
  // Find the first (most specific) budget that failed, or use agent if all passed
  for (const check of applicableBudgets) {
    if (check.level === BudgetLevel.AGENT) {
      decidingLevel = BudgetLevel.AGENT;
      decidingBudget = check;
    }
    if (check.level === BudgetLevel.TEAM && !applicableBudgets.find(c => c.level === BudgetLevel.AGENT)) {
      decidingLevel = BudgetLevel.TEAM;
      decidingBudget = check;
    }
    if (check.level === BudgetLevel.DEPARTMENT && 
        !applicableBudgets.find(c => c.level === BudgetLevel.TEAM) &&
        !applicableBudgets.find(c => c.level === BudgetLevel.AGENT)) {
      decidingLevel = BudgetLevel.DEPARTMENT;
      decidingBudget = check;
    }
  }

  // If no budgets were found at all
  if (applicableBudgets.length === 0) {
    return {
      allowed: false,
      level: BudgetLevel.AGENT,
      budget_id: '',
      remaining: 0,
      spent: 0,
      reserved: 0,
      total: 0,
      reasons: ['No budgets found for hierarchy'],
      applicable_budgets: [],
    };
  }

  // Get the most relevant budget info for response
  const relevantBudget = decidingBudget || applicableBudgets[applicableBudgets.length - 1];

  return {
    allowed: finalDecision,
    level: decidingLevel,
    budget_id: relevantBudget.budget_id,
    remaining: relevantBudget.remaining,
    spent: relevantBudget.spent,
    reserved: relevantBudget.reserved,
    total: relevantBudget.total,
    reasons,
    applicable_budgets: applicableBudgets,
  };
}

/**
 * Reserve budget with hierarchical enforcement
 * 
 * Creates a reservation at the appropriate budget level with
 * automatic expiry after configured seconds (default 60s).
 * 
 * @param db - Database connection
 * @param hierarchy - The hierarchy path
 * @param amount - Amount to reserve
 * @param agentId - Agent making the reservation
 * @param currency - Currency code
 * @returns BudgetReservation if successful
 * @throws Error if any level in hierarchy has insufficient budget
 */
export async function reserveBudget(
  db: Pool | PoolClient,
  hierarchy: HierarchyPath,
  amount: number,
  agentId: string,
  currency: string = 'USD'
): Promise<BudgetReservation> {
  // First check if hierarchical budgets allow this amount
  const checkResult = await checkHierarchicalBudget(db, hierarchy, amount);
  
  if (!checkResult.allowed) {
    throw new Error(
      `Budget reservation denied: ${checkResult.reasons.join('; ')}`
    );
  }

  // Determine which budget level to reserve from
  // Use the most specific level available (agent > team > department)
  let targetLevel: BudgetLevel;
  let targetLevelId: string;

  if (hierarchy.agent_id) {
    targetLevel = BudgetLevel.AGENT;
    targetLevelId = hierarchy.agent_id;
  } else if (hierarchy.team_id) {
    targetLevel = BudgetLevel.TEAM;
    targetLevelId = hierarchy.team_id;
  } else if (hierarchy.department_id) {
    targetLevel = BudgetLevel.DEPARTMENT;
    targetLevelId = hierarchy.department_id;
  } else {
    throw new Error('No budget level found in hierarchy');
  }

  // Get the specific budget
  const targetBudget = await budget.getBudget(db, targetLevel, targetLevelId);
  
  if (!targetBudget) {
    throw new Error(`Budget not found for ${targetLevel} ${targetLevelId}`);
  }

  // Create the reservation
  return budget.createBudgetReservation(
    db,
    targetBudget.id,
    amount,
    agentId,
    currency
  );
}

/**
 * Spend from reserved budget with hierarchical enforcement
 * 
 * Converts a reservation to actual spending and verifies
 * hierarchical budget limits are still satisfied.
 * 
 * @param db - Database connection
 * @param hierarchy - The hierarchy path
 * @param reservationId - The reservation to consume
 * @returns void if successful
 */
export async function spendFromReservation(
  db: Pool | PoolClient,
  hierarchy: HierarchyPath,
  reservationId: string
): Promise<void> {
  // Get the reservation first to know the amount
  const reservationResult = await (db as Pool).query<BudgetReservation>(
    `SELECT * FROM budget_reservations WHERE id = $1`,
    [reservationId]
  );

  if (reservationResult.rows.length === 0) {
    throw new Error(`Reservation not found: ${reservationId}`);
  }

  const reservation = reservationResult.rows[0];

  // Check hierarchical budgets before converting
  // (to ensure we don't over-spend at higher levels)
  const checkResult = await checkHierarchicalBudget(db, hierarchy, reservation.amount);
  
  if (!checkResult.allowed) {
    // Release the reservation instead of consuming it
    await budget.cancelBudgetReservation(db, reservationId);
    throw new Error(
      `Cannot complete spend: hierarchical budget exceeded: ${checkResult.reasons.join('; ')}`
    );
  }

  // Consume the reservation
  await budget.consumeBudgetReservation(db, reservationId);
}

/**
 * Direct spend with hierarchical enforcement (no reservation)
 * 
 * Directly spends from the hierarchical budgets without creating
 * a reservation first. Use this for immediate purchases.
 * 
 * @param db - Database connection
 * @param hierarchy - The hierarchy path
 * @param amount - Amount to spend
 * @param description - Description for audit trail
 * @returns The budget that was charged
 */
export async function directSpend(
  db: Pool | PoolClient,
  hierarchy: HierarchyPath,
  amount: number,
  description: string
): Promise<Budget> {
  // Check hierarchical budgets first
  const checkResult = await checkHierarchicalBudget(db, hierarchy, amount);
  
  if (!checkResult.allowed) {
    throw new Error(
      `Direct spend denied: ${checkResult.reasons.join('; ')}`
    );
  }

  // Determine which budget level to charge
  let targetLevel: BudgetLevel;
  let targetLevelId: string;

  if (hierarchy.agent_id) {
    targetLevel = BudgetLevel.AGENT;
    targetLevelId = hierarchy.agent_id;
  } else if (hierarchy.team_id) {
    targetLevel = BudgetLevel.TEAM;
    targetLevelId = hierarchy.team_id;
  } else if (hierarchy.department_id) {
    targetLevel = BudgetLevel.DEPARTMENT;
    targetLevelId = hierarchy.department_id;
  } else {
    throw new Error('No budget level found in hierarchy');
  }

  // Get current budget for optimistic locking
  const currentBudget = await budget.getBudget(db, targetLevel, targetLevelId);
  
  if (!currentBudget) {
    throw new Error(`Budget not found for ${targetLevel} ${targetLevelId}`);
  }

  // Update spent amount with optimistic locking
  return budget.updateSpentAmount(
    db,
    currentBudget.id,
    amount,
    currentBudget.version
  );
}

/**
 * Release budget reservation
 * 
 * Cancels a reservation and releases the funds back to
 * the available budget.
 * 
 * @param db - Database connection
 * @param reservationId - The reservation to cancel
 */
export async function releaseReservation(
  db: Pool | PoolClient,
  reservationId: string
): Promise<void> {
  await budget.cancelBudgetReservation(db, reservationId);
}

/**
 * Get status of all active reservations for a budget
 */
export async function getActiveReservations(
  db: Pool | PoolClient,
  budgetId: string
): Promise<BudgetReservation[]> {
  const result = await db.query<BudgetReservation>(
    `SELECT * FROM budget_reservations 
     WHERE budget_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [budgetId]
  );

  return result.rows;
}

/**
 * Get all reservations for an agent
 */
export async function getAgentReservations(
  db: Pool | PoolClient,
  agentId: string
): Promise<BudgetReservation[]> {
  const result = await db.query<BudgetReservation>(
    `SELECT * FROM budget_reservations 
     WHERE agent_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [agentId]
  );

  return result.rows;
}
