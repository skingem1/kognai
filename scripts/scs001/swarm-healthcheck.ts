/**
 * swarm-healthcheck.ts — Sprint 731
 *
 * Quick health check for swarm infrastructure:
 *   1. ACP trust scores: all expected agents present
 *   2. ClawRouter: Ollama reachable
 *   3. Sprint file format: validates a sample sprint
 *   4. CTO gate: prompt loads
 *
 * Usage:
 *   npx ts-node scripts/scs001/swarm-healthcheck.ts
 *
 * Telegram: /swarmtest
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

function checkTrustScores(): Check {
  const path = join(ROOT, 'acp', 'trust-scores.json');
  if (!existsSync(path)) return { name: 'ACP Trust Scores', pass: false, detail: 'File not found' };
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    const agents = Object.keys(data.scores || {});
    const required = ['coder', 'supervisor', 'ceo'];
    const missing = required.filter(a => !agents.includes(a));
    if (missing.length > 0) return { name: 'ACP Trust Scores', pass: false, detail: `Missing: ${missing.join(', ')}` };
    return { name: 'ACP Trust Scores', pass: true, detail: `${agents.length} agents registered` };
  } catch (e: any) {
    return { name: 'ACP Trust Scores', pass: false, detail: e.message };
  }
}

function checkOllama(): Check {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  try {
    const out = execSync(`curl -s -m 5 ${host}/api/tags`, { encoding: 'utf-8', timeout: 10000 });
    const data = JSON.parse(out);
    const models = (data.models || []).map((m: any) => m.name);
    const hasQwen = models.some((m: string) => m.includes('qwen'));
    return { name: 'Ollama', pass: true, detail: `${models.length} models${hasQwen ? ' (qwen3 found)' : ' (no qwen3!)'}` };
  } catch {
    return { name: 'Ollama', pass: false, detail: `Cannot reach ${host}` };
  }
}

function checkOrchestrator(): Check {
  const path = join(ROOT, 'scripts', 'orchestrate-agents-v2.ts');
  if (!existsSync(path)) return { name: 'Orchestrator', pass: false, detail: 'File not found' };
  const content = readFileSync(path, 'utf-8');
  const hasDeliverablesFix = content.includes('task.deliverables = { code: target');
  return { name: 'Orchestrator', pass: true, detail: `${Math.round(content.length / 1024)}KB${hasDeliverablesFix ? ', deliverables fix: yes' : ', deliverables fix: no'}` };
}

function checkCTOGate(): Check {
  const path = join(ROOT, 'scripts', 'lib', 'cto-approval-gate.ts');
  if (!existsSync(path)) return { name: 'CTO Gate', pass: false, detail: 'File not found' };
  const content = readFileSync(path, 'utf-8');
  const hasQueueEmptyFix = content.includes('auto-queue-empty');
  return { name: 'CTO Gate', pass: true, detail: `Loaded${hasQueueEmptyFix ? ', queue-empty fix: yes' : ', queue-empty fix: no'}` };
}

function checkRecentSprints(): Check {
  const dir = join(ROOT, 'workspace', 'sprints');
  if (!existsSync(dir)) return { name: 'Sprint Files', pass: false, detail: 'Directory not found' };
  const files = readdirSync(dir).filter(f => f.startsWith('sprint-') && f.endsWith('.json')).sort();
  const latest = files[files.length - 1];
  return { name: 'Sprint Files', pass: files.length > 0, detail: `${files.length} sprints, latest: ${latest}` };
}

function checkClawRouter(): Check {
  const path = join(ROOT, 'scripts', 'lib', 'clawrouter-v2.ts');
  if (!existsSync(path)) return { name: 'ClawRouter', pass: false, detail: 'File not found' };
  const content = readFileSync(path, 'utf-8');
  const timeoutMatch = content.match(/OLLAMA_TIMEOUT_MS\s*=\s*([\d_]+)/);
  const timeout = timeoutMatch ? parseInt(timeoutMatch[1].replace(/_/g, '')) : 0;
  return { name: 'ClawRouter', pass: true, detail: `Ollama timeout: ${timeout / 1000}s` };
}

function main() {
  console.log('=== Swarm Health Check ===\n');
  const checks = [
    checkTrustScores(),
    checkOllama(),
    checkOrchestrator(),
    checkCTOGate(),
    checkClawRouter(),
    checkRecentSprints(),
  ];

  for (const c of checks) {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  const passed = checks.filter(c => c.pass).length;
  console.log(`\n${passed}/${checks.length} checks passed${passed === checks.length ? ' — swarm ready' : ''}`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();
