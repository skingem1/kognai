/**
 * Conway Governance Library
 *
 * Provides agent lifecycle management, audit logging, circuit breakers,
 * and survival tier enforcement for the Conway governance layer.
 *
 * @version 2.0.0 — Conway Edition
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const AUDIT_LOG = path.join(ROOT, 'audit.log');
const TIER_FILE = path.join(ROOT, 'tier.json');
const HEALTH_FILE = path.join(ROOT, 'health.json');
const SOUL_FILE = path.join(ROOT, 'SOUL.md');
const CONSTITUTION_FILE = path.join(ROOT, 'constitution.md');
const AGENTS_DIR = path.join(ROOT, 'agents');

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  role: string;
  llm: string;
  fallback_llm?: string;
  reports_to?: string;
  tools?: string[];
  prompt_summary?: string;
}

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  target?: string;
  rationale: string;
  git_commit?: string;
}

export interface CircuitBreakerState {
  modifications_today: number;
  last_modification: string | null;
  locked_until: string | null;
}

export type SurvivalTier = 'normal' | 'low_compute' | 'critical' | 'dead' | 'pre_launch';

// ─── Audit Logging ───────────────────────────────────────────────────

/**
 * Append an entry to the audit log. Audit log is append-only.
 * No agent can delete or modify past entries.
 */
export function audit(actor: string, action: string, rationale: string, target?: string, gitCommit?: string): void {
  const timestamp = new Date().toISOString();
  const targetStr = target ? ` [TARGET:${target}]` : '';
  const commitStr = gitCommit ? ` [COMMIT:${gitCommit}]` : '';
  const line = `[${timestamp}] [${actor.toUpperCase()}] [${action}]${targetStr} ${rationale}${commitStr}\n`;
  fs.appendFileSync(AUDIT_LOG, line);
}

/**
 * Read audit log entries, optionally filtered by actor or action.
 */
export function readAuditLog(filter?: { actor?: string; action?: string; since?: string }): string[] {
  if (!fs.existsSync(AUDIT_LOG)) return [];
  const lines = fs.readFileSync(AUDIT_LOG, 'utf-8').split('\n').filter(Boolean);

  if (!filter) return lines;

  return lines.filter(line => {
    if (filter.actor && !line.includes(`[${filter.actor.toUpperCase()}]`)) return false;
    if (filter.action && !line.includes(`[${filter.action}]`)) return false;
    if (filter.since) {
      const match = line.match(/^\[([^\]]+)\]/);
      if (match && new Date(match[1]) < new Date(filter.since)) return false;
    }
    return true;
  });
}

// ─── Survival Tier ───────────────────────────────────────────────────

/**
 * Read current survival tier from tier.json
 */
export function getCurrentTier(): SurvivalTier {
  try {
    const tier = JSON.parse(fs.readFileSync(TIER_FILE, 'utf-8'));
    return tier.current_tier as SurvivalTier;
  } catch {
    return 'pre_launch';
  }
}

/**
 * Read current MRR from tier.json
 */
export function getCurrentMRR(): number {
  try {
    const tier = JSON.parse(fs.readFileSync(TIER_FILE, 'utf-8'));
    return tier.mrr || 0;
  } catch {
    return 0;
  }
}

/**
 * Check if a specific action is allowed under current survival tier.
 */
export function isTierActionAllowed(action: 'spawn_agent' | 'modify_prompt' | 'new_feature' | 'replicate'): boolean {
  const tier = getCurrentTier();

  switch (tier) {
    case 'normal':
      return true; // All actions allowed
    case 'low_compute':
      return action !== 'replicate'; // No replication in low compute
    case 'critical':
      return false; // No modifications in critical tier
    case 'dead':
      return false; // No modifications in dead tier
    case 'pre_launch':
      return action !== 'replicate'; // Can't replicate before launch
    default:
      return false;
  }
}

// ─── Circuit Breaker ─────────────────────────────────────────────────

const CIRCUIT_BREAKER_FILE = path.join(ROOT, '.circuit-breaker.json');
const MAX_MODIFICATIONS_PER_DAY = 3;

function readCircuitBreaker(): CircuitBreakerState {
  try {
    if (fs.existsSync(CIRCUIT_BREAKER_FILE)) {
      const state = JSON.parse(fs.readFileSync(CIRCUIT_BREAKER_FILE, 'utf-8'));

      // Reset daily counter if it's a new day
      if (state.last_modification) {
        const lastDate = new Date(state.last_modification).toDateString();
        const today = new Date().toDateString();
        if (lastDate !== today) {
          state.modifications_today = 0;
        }
      }

      return state;
    }
  } catch {}

  return {
    modifications_today: 0,
    last_modification: null,
    locked_until: null,
  };
}

function writeCircuitBreaker(state: CircuitBreakerState): void {
  fs.writeFileSync(CIRCUIT_BREAKER_FILE, JSON.stringify(state, null, 2) + '\n');
}

/**
 * Check if the circuit breaker allows a modification.
 * Returns true if allowed, false if blocked.
 */
export function canModify(): boolean {
  const tier = getCurrentTier();

  // No modifications during critical or dead tier
  if (tier === 'critical' || tier === 'dead') {
    return false;
  }

  const state = readCircuitBreaker();

  // Check if locked
  if (state.locked_until && new Date() < new Date(state.locked_until)) {
    return false;
  }

  // Check daily limit
  return state.modifications_today < MAX_MODIFICATIONS_PER_DAY;
}

/**
 * Record a modification in the circuit breaker.
 */
export function recordModification(): void {
  const state = readCircuitBreaker();
  state.modifications_today++;
  state.last_modification = new Date().toISOString();
  writeCircuitBreaker(state);
}

// ─── Agent Lifecycle ─────────────────────────────────────────────────

/**
 * Spawn a new agent by creating its directory structure and config files.
 */
export function spawnAgent(config: AgentConfig, actor: string, rationale: string): boolean {
  // Check circuit breaker
  if (!canModify()) {
    audit(actor, 'SPAWN_BLOCKED', `Circuit breaker: Cannot spawn ${config.name} — daily limit reached or tier restriction`, config.name);
    return false;
  }

  // Check tier
  if (!isTierActionAllowed('spawn_agent')) {
    audit(actor, 'SPAWN_BLOCKED', `Tier restriction: Cannot spawn agents in ${getCurrentTier()} tier`, config.name);
    return false;
  }

  const agentDir = path.join(AGENTS_DIR, config.name);

  // Don't overwrite existing agent
  if (fs.existsSync(agentDir)) {
    audit(actor, 'SPAWN_BLOCKED', `Agent ${config.name} already exists`, config.name);
    return false;
  }

  // Create agent directory
  fs.mkdirSync(agentDir, { recursive: true });

  // Write agent.yaml
  const yaml = [
    `name: ${config.name}`,
    `role: ${config.role}`,
    `llm: ${config.llm}`,
    config.fallback_llm ? `fallback_llm: ${config.fallback_llm}` : null,
    config.reports_to ? `reports_to: ${config.reports_to}` : null,
    config.tools ? `tools:\n${config.tools.map(t => `  - ${t}`).join('\n')}` : null,
  ].filter(Boolean).join('\n') + '\n';

  fs.writeFileSync(path.join(agentDir, 'agent.yaml'), yaml);

  // Write prompt.md
  const prompt = [
    `# ${config.name} Agent — ${config.role}`,
    '',
    config.prompt_summary || `You are the ${config.name} agent for Invoica.`,
    '',
    '## Conway Governance',
    '',
    'Read `constitution.md` at session start. Comply with the Three Laws at all times.',
    'Read `tier.json` to understand current survival tier.',
    'All actions are logged to `audit.log`.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(agentDir, 'prompt.md'), prompt);

  // Record modification
  recordModification();
  audit(actor, 'AGENT_SPAWNED', rationale, config.name);

  return true;
}

/**
 * Kill (deactivate) an agent by removing its directory.
 * Agent config is preserved in git history for rollback.
 */
export function killAgent(agentName: string, actor: string, rationale: string): boolean {
  // Check circuit breaker
  if (!canModify()) {
    audit(actor, 'KILL_BLOCKED', `Circuit breaker: Cannot kill ${agentName} — daily limit reached or tier restriction`, agentName);
    return false;
  }

  const agentDir = path.join(AGENTS_DIR, agentName);

  // Check agent exists
  if (!fs.existsSync(agentDir)) {
    audit(actor, 'KILL_BLOCKED', `Agent ${agentName} does not exist`, agentName);
    return false;
  }

  // Protect critical agents
  const protectedAgents = ['ceo', 'cto', 'supervisor'];
  if (protectedAgents.includes(agentName)) {
    audit(actor, 'KILL_BLOCKED', `Agent ${agentName} is protected — cannot be killed`, agentName);
    return false;
  }

  // Mark as inactive (rename directory with .inactive suffix)
  const inactiveDir = agentDir + '.inactive';
  fs.renameSync(agentDir, inactiveDir);

  // Record modification
  recordModification();
  audit(actor, 'AGENT_KILLED', rationale, agentName);

  return true;
}

/**
 * Rollback an agent to its previous state by restoring from .inactive directory.
 */
export function rollbackAgent(agentName: string, actor: string): boolean {
  const inactiveDir = path.join(AGENTS_DIR, agentName + '.inactive');
  const agentDir = path.join(AGENTS_DIR, agentName);

  if (!fs.existsSync(inactiveDir)) {
    audit(actor, 'ROLLBACK_FAILED', `No inactive version of ${agentName} found`, agentName);
    return false;
  }

  if (fs.existsSync(agentDir)) {
    // Current version exists — swap them
    const tempDir = agentDir + '.temp';
    fs.renameSync(agentDir, tempDir);
    fs.renameSync(inactiveDir, agentDir);
    fs.renameSync(tempDir, inactiveDir);
  } else {
    fs.renameSync(inactiveDir, agentDir);
  }

  audit(actor, 'AGENT_ROLLBACK', `Rolled back ${agentName} to previous version`, agentName);
  return true;
}

// ─── SOUL.md Management ──────────────────────────────────────────────

/**
 * Read SOUL.md contents for CEO context injection.
 */
export function readSoul(): string {
  try {
    return fs.readFileSync(SOUL_FILE, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Append a session update to SOUL.md.
 */
export function updateSoul(section: string, content: string): void {
  const soul = readSoul();
  const timestamp = new Date().toISOString().split('T')[0];
  const update = `\n### Session Update — ${timestamp}\n\n${content}\n`;

  // Find the section and append, or add at end
  const sectionHeader = `## ${section}`;
  const sectionIndex = soul.indexOf(sectionHeader);

  if (sectionIndex >= 0) {
    // Find next section or end of file
    const nextSectionMatch = soul.slice(sectionIndex + sectionHeader.length).match(/\n## /);
    const insertPos = nextSectionMatch
      ? sectionIndex + sectionHeader.length + (nextSectionMatch.index || 0)
      : soul.length;

    const updated = soul.slice(0, insertPos) + update + soul.slice(insertPos);
    fs.writeFileSync(SOUL_FILE, updated);
  } else {
    // Append to end
    fs.writeFileSync(SOUL_FILE, soul + update);
  }

  audit('CEO', 'SOUL_UPDATE', `Updated SOUL.md section: ${section}`);
}

// ─── Constitution Enforcement ────────────────────────────────────────

/**
 * Verify that constitution.md has not been tampered with.
 * Returns the hash of the constitution for integrity checking.
 */
export function verifyConstitution(): { valid: boolean; hash: string } {
  try {
    const content = fs.readFileSync(CONSTITUTION_FILE, 'utf-8');

    // Check for required elements
    const hasLawI = content.includes('Law I — Never Harm');
    const hasLawII = content.includes("Law II — Earn Invoica's Existence");
    const hasLawIII = content.includes('Law III — Transparency to Creator, Strategy to Self');
    const hasImmutable = content.includes('READ-ONLY');

    const valid = hasLawI && hasLawII && hasLawIII && hasImmutable;

    // Simple hash for integrity checking
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }

    if (!valid) {
      audit('SYSTEM', 'CONSTITUTION_VIOLATION', 'Constitution integrity check failed — missing required elements');
    }

    return { valid, hash: hash.toString(16) };
  } catch {
    audit('SYSTEM', 'CONSTITUTION_MISSING', 'Constitution file not found');
    return { valid: false, hash: '' };
  }
}

// ─── Replication ─────────────────────────────────────────────────────

export interface ReplicationProposal {
  id: string;
  target_market: string;
  budget_request: number;
  genesis_prompt: string;
  success_metrics: Record<string, number>;
  proposed_by: string;
  proposed_at: string;
}

/**
 * File a replication proposal for human review.
 */
export function fileReplicationProposal(proposal: ReplicationProposal): boolean {
  const mrr = getCurrentMRR();

  // Replication requires $10,000+ MRR
  if (mrr < 10000) {
    audit('CEO', 'REPLICATION_BLOCKED', `MRR $${mrr} below $10,000 threshold`);
    return false;
  }

  if (!isTierActionAllowed('replicate')) {
    audit('CEO', 'REPLICATION_BLOCKED', `Tier ${getCurrentTier()} does not allow replication`);
    return false;
  }

  const proposalDir = path.join(ROOT, 'replication_proposals');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(proposalDir, `${timestamp}.json`);

  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2) + '\n');

  audit('CEO', 'REPLICATION_PROPOSED', `Replication proposal filed: ${proposal.target_market}`, filePath);

  return true;
}

/**
 * Check for approved replication proposals.
 */
export function getApprovedReplications(): string[] {
  const dir = path.join(ROOT, 'approved_replications');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dir, f));
}

// ─── Export All ──────────────────────────────────────────────────────

export const Conway = {
  audit,
  readAuditLog,
  getCurrentTier,
  getCurrentMRR,
  isTierActionAllowed,
  canModify,
  recordModification,
  spawnAgent,
  killAgent,
  rollbackAgent,
  readSoul,
  updateSoul,
  verifyConstitution,
  fileReplicationProposal,
  getApprovedReplications,
};

export default Conway;
