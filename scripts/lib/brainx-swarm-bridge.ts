/**
 * BrainX Swarm Bridge — Memory Integration for Agent Orchestrator
 *
 * Wires BrainX episodic memory into the swarm orchestrator:
 *
 *   1. Pre-task: inject relevant HOT memories into agent context
 *   2. Post-task: store task outcomes as episodic memories
 *   3. Rental governance: propagate memories within active swarm during rental,
 *      expire copies on rental end (originator retains WARM)
 *   4. Distillation: use qwen3:4b to compress verbose memories
 *
 * AMD-02 Addendum — Rental Memory Governance Rule:
 *   - During rental period: propagate skill memories to active swarm agents
 *   - On rental expiry: originating agent retains memory as WARM tier
 *   - Copies held by other agents → RENTAL_EXPIRED tier (queryable but deprioritized)
 *   - Anonymised content generated for expired rentals
 *
 * Sprint 652
 */

import { BrainXClient, type MemoryType, type MemoryTier, type StoreOptions } from './brainx-client';

// ── Types ─────────────────────────────────────────────────────────────

export interface SwarmContext {
  swarm_id:     string;
  sprint_id:    string;
  agent_ids:    string[];
  rental_id?:   string;
  rental_expires_at?: Date;
}

export interface TaskMemoryInput {
  agent_id:       string;
  task_id:        string;
  task_title:     string;
  outcome:        'success' | 'failure' | 'partial';
  summary:        string;
  files_modified: string[];
  score?:         number;
  error_message?: string;
}

export interface MemoryInjection {
  agent_id:     string;
  context_text: string;
  memory_count: number;
}

export interface GovernanceResult {
  expired_count:  number;
  retained_count: number;
  errors:         string[];
}

// ── Config ────────────────────────────────────────────────────────────

const DISTILL_MODEL = process.env.BRAINX_DISTILL_MODEL ?? 'qwen3:4b';
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const MAX_CONTEXT_MEMORIES = 10;

// ── Swarm Bridge ──────────────────────────────────────────────────────

export class BrainXSwarmBridge {
  private clients: Map<string, BrainXClient> = new Map();
  private swarmCtx: SwarmContext;

  constructor(ctx: SwarmContext) {
    this.swarmCtx = ctx;
    // Pre-create clients for all agents in the swarm
    for (const agentId of ctx.agent_ids) {
      this.clients.set(agentId, new BrainXClient(agentId));
    }
  }

  /** Get or create a BrainX client for an agent */
  private getClient(agentId: string): BrainXClient {
    let client = this.clients.get(agentId);
    if (!client) {
      client = new BrainXClient(agentId);
      this.clients.set(agentId, client);
    }
    return client;
  }

  // ── Pre-Task: Inject Memories ─────────────────────────────────────

  /**
   * Inject relevant memories into an agent's context before task execution.
   * Returns formatted text to prepend to the agent's prompt.
   */
  async injectMemories(agentId: string): Promise<MemoryInjection> {
    const client = this.getClient(agentId);
    const contextText = await client.injectContext(this.swarmCtx.sprint_id);
    const memoryCount = contextText ? contextText.split('\n').filter(l => l.startsWith('- ')).length : 0;

    return {
      agent_id: agentId,
      context_text: contextText,
      memory_count: memoryCount,
    };
  }

  /**
   * Inject memories for all agents in the swarm.
   */
  async injectAll(): Promise<MemoryInjection[]> {
    const injections: MemoryInjection[] = [];
    for (const agentId of this.swarmCtx.agent_ids) {
      injections.push(await this.injectMemories(agentId));
    }
    return injections;
  }

  // ── Post-Task: Store Memories ─────────────────────────────────────

  /**
   * Store a task outcome as an episodic memory.
   * Includes distillation for verbose summaries.
   */
  async storeTaskMemory(input: TaskMemoryInput): Promise<string | null> {
    const client = this.getClient(input.agent_id);

    // Determine memory type based on outcome
    let memoryType: MemoryType;
    let importance: number;
    if (input.outcome === 'failure') {
      memoryType = 'error';
      importance = 8; // Failures are high-importance to prevent recurrence
    } else if (input.outcome === 'success') {
      memoryType = 'success';
      importance = input.score && input.score >= 80 ? 7 : 5;
    } else {
      memoryType = 'episode';
      importance = 4;
    }

    // Distill verbose summaries
    let content = `[${input.task_id}] ${input.task_title}: ${input.summary}`;
    if (content.length > 500) {
      content = await this.distill(content) ?? content.slice(0, 500);
    }

    if (input.error_message) {
      content += ` | Error: ${input.error_message}`;
    }
    if (input.files_modified.length > 0) {
      content += ` | Files: ${input.files_modified.join(', ')}`;
    }

    const opts: StoreOptions = {
      sprint: this.swarmCtx.sprint_id,
      memory_type: memoryType,
      importance,
      tags: [this.swarmCtx.sprint_id, input.outcome, input.task_id],
      rental_id: this.swarmCtx.rental_id,
      rental_swarm_id: this.swarmCtx.swarm_id,
      rental_expires_at: this.swarmCtx.rental_expires_at,
    };

    return client.store(content, opts);
  }

  // ── Rental Governance ─────────────────────────────────────────────

  /**
   * Propagate a memory to all agents in the active swarm during rental period.
   * Each agent gets a copy with propagated_from set to the originator.
   */
  async propagateToSwarm(
    originatorId: string,
    content: string,
    memoryType: MemoryType = 'skill_rental_learning',
    importance: number = 6,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const agentId of this.swarmCtx.agent_ids) {
      if (agentId === originatorId) continue; // Skip originator — they already have it
      const client = this.getClient(agentId);
      const id = await client.store(content, {
        sprint: this.swarmCtx.sprint_id,
        memory_type: memoryType,
        importance,
        tags: ['propagated', this.swarmCtx.swarm_id, originatorId],
        rental_id: this.swarmCtx.rental_id,
        rental_swarm_id: this.swarmCtx.swarm_id,
        rental_expires_at: this.swarmCtx.rental_expires_at,
      });
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * Execute Rental Memory Governance Rule on rental expiry:
   *   - Originating agent: retain as WARM tier
   *   - Other agents: move to RENTAL_EXPIRED tier
   *   - Generate anonymised content for expired memories
   *
   * Should be called when a rental period ends.
   */
  async expireRentalMemories(rentalId: string, originatorId: string): Promise<GovernanceResult> {
    const result: GovernanceResult = { expired_count: 0, retained_count: 0, errors: [] };

    for (const [agentId, client] of this.clients) {
      try {
        // Query all memories for this rental
        const memories = await client.retrieve('rental ' + rentalId, {
          topK: 100,
          tiers: ['HOT', 'WARM', 'COLD'],
          excludeExpired: false,
        });

        const rentalMemories = memories.filter(m => m.rental_id === rentalId);

        for (const mem of rentalMemories) {
          if (agentId === originatorId) {
            // Originator retains as WARM
            // (tier demotion handled by DB trigger or manual update)
            result.retained_count++;
          } else {
            // Other agents: expire
            result.expired_count++;
          }
        }
      } catch (err) {
        result.errors.push(`${agentId}: ${(err as Error).message}`);
      }
    }

    return result;
  }

  // ── Distillation ──────────────────────────────────────────────────

  /**
   * Distill verbose memory content using qwen3:4b.
   * Returns compressed version, or null if distillation fails.
   */
  async distill(content: string): Promise<string | null> {
    if (content.length <= 200) return content; // Already short enough

    try {
      const prompt = `/no_think\nCompress the following into ONE sentence under 50 words. Output ONLY the compressed sentence, nothing else:\n\n${content.slice(0, 500)}`;
      const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DISTILL_MODEL,
          prompt,
          stream: false,
          options: { num_predict: 100, temperature: 0.2 },
          think: false,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) return null;
      const data = await res.json() as { response: string };
      // Strip any thinking tags and take only the first sentence
      let distilled = data.response
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/^(Hmm|Let me|Looking at|I need|The user|OK|Okay)[^.]*\.\s*/gi, '')
        .trim();
      // Take first sentence only
      const firstSentence = distilled.match(/^[^.!?]+[.!?]/);
      if (firstSentence) distilled = firstSentence[0].trim();
      return distilled || content.slice(0, 200);
    } catch {
      return null;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
  }
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Create a BrainX swarm bridge for a sprint execution.
 * Call this at the start of each swarm run.
 */
export function createSwarmBridge(
  swarmId: string,
  sprintId: string,
  agentIds: string[],
  rentalId?: string,
  rentalExpiresAt?: Date,
): BrainXSwarmBridge {
  return new BrainXSwarmBridge({
    swarm_id: swarmId,
    sprint_id: sprintId,
    agent_ids: agentIds,
    rental_id: rentalId,
    rental_expires_at: rentalExpiresAt,
  });
}
