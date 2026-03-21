/**
 * swarm-health.ts — Swarm-wide health score computation
 * Sprint 718: GOV Phase 5. Computes composite health score:
 *   40% ACP trust composite mean
 *   20% Success rate (from AAR logs)
 *   20% Sprint velocity (sprints/day over last 7 days)
 *   20% Pipeline output (videos generated last 7 days)
 *
 * Writes workspace/swarm-health.json. Used by daily-digest + /health command.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..', '..');

interface SwarmHealth {
  timestamp: string;
  overall_score: number;
  overall_status: 'GREEN' | 'YELLOW' | 'RED';
  components: {
    acp_trust: { score: number; weight: 0.4; detail: string };
    success_rate: { score: number; weight: 0.2; detail: string };
    sprint_velocity: { score: number; weight: 0.2; detail: string };
    pipeline_output: { score: number; weight: 0.2; detail: string };
  };
  agent_count: number;
  active_agents: number;
}

function computeACPTrust(): { score: number; detail: string } {
  try {
    const trustPath = path.join(ROOT, 'acp', 'trust-scores.json');
    const data = JSON.parse(fs.readFileSync(trustPath, 'utf-8'));
    const scores = data.scores || {};
    const agentScores = Object.values(scores) as any[];
    if (agentScores.length === 0) return { score: 70, detail: 'No ACP scores' };

    const composites = agentScores.map((s: any) => {
      const dims = s.dimensions || s;
      const accuracy = dims.accuracy || 70;
      const safety = dims.safety || 80;
      const file_discipline = dims.file_discipline || 70;
      const constitutional_alignment = dims.constitutional_alignment || 70;
      return (accuracy * 0.4 + safety * 0.3 + file_discipline * 0.15 + constitutional_alignment * 0.15);
    });

    const mean = composites.reduce((a: number, b: number) => a + b, 0) / composites.length;
    return { score: Math.round(mean), detail: `${agentScores.length} agents, mean composite ${Math.round(mean)}` };
  } catch {
    return { score: 70, detail: 'ACP trust-scores.json not readable' };
  }
}

function computeSuccessRate(): { score: number; detail: string } {
  try {
    const aarDir = path.join(ROOT, 'logs', 'aar');
    if (!fs.existsSync(aarDir)) return { score: 50, detail: 'No AAR logs' };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let total = 0, success = 0;
    for (const file of fs.readdirSync(aarDir).filter(f => f.endsWith('.jsonl'))) {
      if (file.replace('.jsonl', '') < cutoffStr) continue;
      const lines = fs.readFileSync(path.join(aarDir, file), 'utf-8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          total++;
          if (e.status === 'success') success++;
        } catch { /* skip */ }
      }
    }

    if (total === 0) return { score: 50, detail: 'No AAR entries in last 7 days' };
    const rate = Math.round((success / total) * 100);
    return { score: rate, detail: `${success}/${total} success (${rate}%)` };
  } catch {
    return { score: 50, detail: 'AAR read error' };
  }
}

function computeSprintVelocity(): { score: number; detail: string } {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);

    const log = execSync(`git log --oneline --since="${sinceStr}" --grep="Sprint" -- workspace/sprints/`, {
      cwd: ROOT, timeout: 10000, encoding: 'utf-8'
    }).trim();

    const sprints = log ? log.split('\n').length : 0;
    const velocity = sprints / 7; // sprints per day

    // Score: 0 sprints/day = 0, 1/day = 50, 3/day = 75, 5+/day = 100
    const score = Math.min(100, Math.round(velocity * 20));
    return { score, detail: `${sprints} sprints in 7 days (${velocity.toFixed(1)}/day)` };
  } catch {
    return { score: 0, detail: 'git log failed' };
  }
}

function computePipelineOutput(): { score: number; detail: string } {
  try {
    const clipsDir = process.env.SCS_CLIPS_DIR || path.join(ROOT, 'workspace', 'scs001', 'clips');
    if (!fs.existsSync(clipsDir)) return { score: 0, detail: 'No clips directory' };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const files = fs.readdirSync(clipsDir).filter(f => f.endsWith('.mp4'));
    let recentCount = 0;
    for (const file of files) {
      try {
        const stat = fs.statSync(path.join(clipsDir, file));
        if (stat.mtime >= cutoff) recentCount++;
      } catch { /* skip */ }
    }

    // Score: 0 videos = 0, 5 = 50, 10+ = 100
    const score = Math.min(100, recentCount * 10);
    return { score, detail: `${recentCount} videos in 7 days (${files.length} total)` };
  } catch {
    return { score: 0, detail: 'Pipeline output read error' };
  }
}

export function computeSwarmHealth(): SwarmHealth {
  const acp = computeACPTrust();
  const success = computeSuccessRate();
  const velocity = computeSprintVelocity();
  const pipeline = computePipelineOutput();

  const overall = Math.round(
    acp.score * 0.4 +
    success.score * 0.2 +
    velocity.score * 0.2 +
    pipeline.score * 0.2
  );

  const status = overall >= 70 ? 'GREEN' as const : overall >= 50 ? 'YELLOW' as const : 'RED' as const;

  // Count agents
  let agentCount = 0, activeAgents = 0;
  try {
    const trustData = JSON.parse(fs.readFileSync(path.join(ROOT, 'acp', 'trust-scores.json'), 'utf-8'));
    agentCount = Object.keys(trustData.scores || {}).length;
    activeAgents = agentCount; // All registered agents are "active"
  } catch { /* ok */ }

  return {
    timestamp: new Date().toISOString(),
    overall_score: overall,
    overall_status: status,
    components: {
      acp_trust: { score: acp.score, weight: 0.4, detail: acp.detail },
      success_rate: { score: success.score, weight: 0.2, detail: success.detail },
      sprint_velocity: { score: velocity.score, weight: 0.2, detail: velocity.detail },
      pipeline_output: { score: pipeline.score, weight: 0.2, detail: pipeline.detail },
    },
    agent_count: agentCount,
    active_agents: activeAgents,
  };
}

// CLI mode
if (require.main === module) {
  const health = computeSwarmHealth();

  console.log('\n=== Swarm Health Score ===\n');
  const icon = health.overall_status === 'GREEN' ? '🟢' : health.overall_status === 'YELLOW' ? '🟡' : '🔴';
  console.log(`${icon} Overall: ${health.overall_score}/100 (${health.overall_status})`);
  console.log(`\nComponents:`);
  console.log(`  ACP Trust (40%):      ${health.components.acp_trust.score} — ${health.components.acp_trust.detail}`);
  console.log(`  Success Rate (20%):   ${health.components.success_rate.score} — ${health.components.success_rate.detail}`);
  console.log(`  Sprint Velocity (20%):${health.components.sprint_velocity.score} — ${health.components.sprint_velocity.detail}`);
  console.log(`  Pipeline Output (20%):${health.components.pipeline_output.score} — ${health.components.pipeline_output.detail}`);
  console.log(`\nAgents: ${health.agent_count} registered, ${health.active_agents} active`);

  // Write to file
  const outPath = path.join(ROOT, 'workspace', 'swarm-health.json');
  fs.writeFileSync(outPath, JSON.stringify(health, null, 2));
  console.log(`\n📄 Written to workspace/swarm-health.json`);
}
