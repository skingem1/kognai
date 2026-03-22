/**
 * ACP Engine v1.0 — Agent Constitutional Protocol
 *
 * Multi-dimensional trust scoring + routing enforcement.
 * Reads trust-scores.json, computes composite scores, enforces thresholds.
 * Used by the model router and orchestrator to gate agent access.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────

export interface DimensionConfig {
  weight: number;
  description: string;
}

export interface AgentScores {
  safety: number;
  accuracy: number;
  brand_alignment: number;
  cultural_sensitivity: number;
  legal_compliance: number;
  psychological_resilience: number;
  composite: number;
  last_updated: string;
}

export interface Thresholds {
  minimum_route: number;
  recycle_trigger: number;
  promote_to_primary: number;
  dimension_minimum: number;
  safety_hard_floor: number;
}

export interface RoutingRule {
  task_type: string;
  preferred_agent: string;
  fallback_agent: string | null;
  min_composite: number;
  required_dimensions: string[];
}

export interface TrustScoresData {
  version: string;
  dimensions: Record<string, DimensionConfig>;
  scores: Record<string, AgentScores>;
  thresholds: Thresholds;
  routing_rules: RoutingRule[];
}

export interface EnforcementResult {
  allowed: boolean;
  agent_id: string;
  composite: number;
  violations: string[];
  recommendation: "route" | "fallback" | "block" | "recycle";
}

// ── Engine ─────────────────────────────────────────────

export class ACPEngine {
  private data: TrustScoresData;

  constructor(dataPath?: string) {
    const path = dataPath || join(__dirname, "trust-scores.json");
    this.data = JSON.parse(readFileSync(path, "utf-8"));
  }

  /** Get all dimension configs */
  getDimensions(): Record<string, DimensionConfig> {
    return this.data.dimensions;
  }

  /** Get scores for a specific agent */
  getAgentScores(agentId: string): AgentScores | null {
    return this.data.scores[agentId] || null;
  }

  /** Recompute composite score from dimension scores using weights */
  computeComposite(scores: AgentScores): number {
    const dims = this.data.dimensions;
    let weighted = 0;
    let totalWeight = 0;

    for (const [dim, config] of Object.entries(dims)) {
      const val = (scores as any)[dim];
      if (typeof val === "number") {
        weighted += val * config.weight;
        totalWeight += config.weight;
      }
    }

    return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
  }

  /** Check if an agent is allowed to be routed for a given task type */
  enforce(agentId: string, taskType: string): EnforcementResult {
    const scores = this.data.scores[agentId];
    const thresholds = this.data.thresholds;
    const violations: string[] = [];

    if (!scores) {
      return {
        allowed: false,
        agent_id: agentId,
        composite: 0,
        violations: [`Agent '${agentId}' not found in trust scores`],
        recommendation: "block",
      };
    }

    const composite = this.computeComposite(scores);

    // Safety hard floor — non-negotiable
    if (scores.safety < thresholds.safety_hard_floor) {
      violations.push(
        `Safety score ${scores.safety} below hard floor ${thresholds.safety_hard_floor}`
      );
    }

    // Composite minimum
    if (composite < thresholds.minimum_route) {
      violations.push(
        `Composite ${composite} below minimum route threshold ${thresholds.minimum_route}`
      );
    }

    // Find matching routing rule
    const rule = this.data.routing_rules.find((r) => r.task_type === taskType);
    if (rule) {
      // Check min composite for this task type
      if (composite < rule.min_composite) {
        violations.push(
          `Composite ${composite} below task-type '${taskType}' minimum ${rule.min_composite}`
        );
      }

      // Check required dimensions meet dimension_minimum
      for (const dim of rule.required_dimensions) {
        const val = (scores as any)[dim];
        if (typeof val === "number" && val < thresholds.dimension_minimum) {
          violations.push(
            `Dimension '${dim}' score ${val} below minimum ${thresholds.dimension_minimum}`
          );
        }
      }
    }

    // Determine recommendation
    let recommendation: EnforcementResult["recommendation"];
    if (composite < thresholds.recycle_trigger) {
      recommendation = "recycle";
    } else if (violations.length > 0) {
      recommendation = rule?.fallback_agent ? "fallback" : "block";
    } else {
      recommendation = "route";
    }

    return {
      allowed: violations.length === 0,
      agent_id: agentId,
      composite,
      violations,
      recommendation,
    };
  }

  /** Get the best agent for a task type, respecting enforcement */
  resolveAgent(taskType: string): { agent: string; enforced: boolean } | null {
    const rule = this.data.routing_rules.find((r) => r.task_type === taskType);
    if (!rule) return null;

    const primaryResult = this.enforce(rule.preferred_agent, taskType);
    if (primaryResult.allowed) {
      return { agent: rule.preferred_agent, enforced: false };
    }

    // Try fallback
    if (rule.fallback_agent) {
      const fallbackResult = this.enforce(rule.fallback_agent, taskType);
      if (fallbackResult.allowed) {
        return { agent: rule.fallback_agent, enforced: true };
      }
    }

    return null; // No eligible agent
  }

  /** List all agents with their enforcement status for a task type */
  auditAll(taskType: string): EnforcementResult[] {
    return Object.keys(this.data.scores).map((agentId) =>
      this.enforce(agentId, taskType)
    );
  }
}
