/**
 * post-sprint-governance.ts — Fires governance hooks after ANY sprint completion
 *
 * Called from:
 *   1. orchestrate-agents-v2.ts (already wired — this is a fallback/supplement)
 *   2. generate-sprint-brief.py (via subprocess after sprint commit)
 *   3. Git post-commit hook (catches ALL commits)
 *   4. Manual: npx ts-node scripts/lib/post-sprint-governance.ts <sprint-id>
 *
 * Produces:
 *   - AAR receipt → logs/aar/YYYY-MM-DD.jsonl
 *   - Trust score update → acp/trust-scores.json
 *   - BrainX memory → PostgreSQL brainx_memories table
 *   - LoRA corpus update → vault/training/corpus-r1.jsonl (if approved task)
 *
 * Non-blocking: all errors are caught and logged. Never breaks the sprint flow.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

interface GovernanceResult {
  sprint_id: string;
  aar_written: boolean;
  trust_updated: boolean;
  brainx_stored: boolean;
  corpus_appended: boolean;
  errors: string[];
}

export async function runPostSprintGovernance(sprintId: string, agentId: string = 'coder', score: number = 75, outcome: 'success' | 'rejected' = 'success'): Promise<GovernanceResult> {
  const result: GovernanceResult = {
    sprint_id: sprintId,
    aar_written: false,
    trust_updated: false,
    brainx_stored: false,
    corpus_appended: false,
    errors: [],
  };

  const timestamp = new Date().toISOString();
  const today = timestamp.slice(0, 10);

  // 1. AAR Receipt
  try {
    const aarDir = join(ROOT, 'logs', 'aar');
    mkdirSync(aarDir, { recursive: true });
    const aarFile = join(aarDir, `${today}.jsonl`);

    // Check if this sprint already has an AAR entry (idempotent)
    if (existsSync(aarFile)) {
      const existing = readFileSync(aarFile, 'utf-8');
      if (existing.includes(sprintId)) {
        result.aar_written = true; // Already logged
      }
    }

    if (!result.aar_written) {
      const receipt = {
        receiptId: `${sprintId}-${agentId}-${Date.now()}`,
        agentId,
        agentAddress: '0x0000000000000000000000000000000000000000',
        taskId: `${sprintId}-gov`,
        sprintId,
        skillId: 'sprint-execution',
        outcomeScore: score,
        actionSummary: `Sprint ${sprintId} ${outcome} (score: ${score})`,
        timestamp,
        status: outcome,
        aarReceiptHash: createHash('sha256').update(`${sprintId}:${agentId}:${timestamp}`).digest('hex'),
      };
      appendFileSync(aarFile, JSON.stringify(receipt) + '\n');
      result.aar_written = true;
    }
  } catch (err: any) {
    result.errors.push(`AAR: ${err.message}`);
  }

  // 2. Trust Score Update
  try {
    const { updateTrustScore } = require('./trust-score-updater');
    updateTrustScore(agentId, outcome === 'success' ? 'approved' : 'rejected', score);
    result.trust_updated = true;
  } catch (err: any) {
    result.errors.push(`Trust: ${err.message}`);
  }

  // 3. BrainX Memory
  try {
    const { createSwarmBridge } = require('./brainx-swarm-bridge');
    const bridge = createSwarmBridge(`gov-${Date.now()}`, sprintId, [agentId]);
    await bridge.storeTaskMemory({
      agent_id: agentId,
      task_id: `${sprintId}-gov`,
      task_title: `Sprint ${sprintId} (${outcome})`,
      outcome,
      score,
      summary: `Sprint ${sprintId} completed with ${outcome} (score: ${score})`,
      files_modified: [],
    });
    await bridge.close();
    result.brainx_stored = true;
  } catch (err: any) {
    result.errors.push(`BrainX: ${err.message}`);
  }

  // 4. LoRA Corpus (only for approved sprints with score >= 70)
  if (outcome === 'success' && score >= 70) {
    try {
      const corpusPath = join(ROOT, 'vault', 'training', 'corpus-r1.jsonl');
      if (existsSync(corpusPath)) {
        // Read sprint JSON for instruction-response pair
        const sprintFile = join(ROOT, 'workspace', 'sprints', `${sprintId}.json`);
        if (existsSync(sprintFile)) {
          const sprint = JSON.parse(readFileSync(sprintFile, 'utf-8'));
          const entry = {
            instruction: sprint.title || sprint.description || sprintId,
            response: `Completed: ${sprint.tasks?.map((t: any) => t.title || t.id).join('; ') || 'unknown tasks'}`,
            sprint_id: sprintId,
            score,
            timestamp,
            source: 'post-sprint-governance',
          };
          appendFileSync(corpusPath, JSON.stringify(entry) + '\n');
          result.corpus_appended = true;
        }
      }
    } catch (err: any) {
      result.errors.push(`Corpus: ${err.message}`);
    }
  }

  return result;
}

// CLI entry point
if (require.main === module) {
  const sprintId = process.argv[2] || 'unknown';
  const agentId = process.argv[3] || 'coder';
  const score = parseInt(process.argv[4] || '75');
  const outcome = (process.argv[5] || 'success') as 'success' | 'rejected';

  console.log(`[GOV] Running post-sprint governance for ${sprintId}...`);
  runPostSprintGovernance(sprintId, agentId, score, outcome)
    .then(result => {
      console.log(`[GOV] AAR: ${result.aar_written ? '✅' : '❌'} | Trust: ${result.trust_updated ? '✅' : '❌'} | BrainX: ${result.brainx_stored ? '✅' : '❌'} | Corpus: ${result.corpus_appended ? '✅' : '❌'}`);
      if (result.errors.length > 0) {
        console.log(`[GOV] Errors: ${result.errors.join(', ')}`);
      }
    })
    .catch(err => console.error(`[GOV] Fatal: ${err.message}`));
}
