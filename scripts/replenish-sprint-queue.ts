#!/usr/bin/env ts-node
/**
 * replenish-sprint-queue.ts — Sprint 591
 * Auto-generates sprint queue items when queue is empty.
 *
 * Analyzes: watchdog alerts, env gaps, pipeline state, error logs,
 * recent sprint patterns, and codebase coverage to produce actionable items.
 *
 * Usage: npx ts-node scripts/replenish-sprint-queue.ts
 * Dry-run: REPLENISH_DRY_RUN=1 npx ts-node scripts/replenish-sprint-queue.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');

interface QueueItem {
  sprint: number;
  title: string;
  block: string;
  status: string;
  priority: string;
  rationale: string;
}

interface QueueFile {
  _note: string;
  updated: string;
  owner: string;
  _plan_rationale: string;
  queue: QueueItem[];
}

function readJSON<T>(filePath: string): T | null {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function readLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function getLastSprintNumber(): number {
  try {
    const log = execSync('git log --oneline -20', { cwd: ROOT, encoding: 'utf-8' });
    const match = log.match(/Sprint (\d+):/);
    return match ? parseInt(match[1], 10) : 590;
  } catch { return 590; }
}

function getWatchdogAlerts(): Array<{ severity: string; title: string; detail: string }> {
  const watchdog = readJSON<any>(path.join(ROOT, 'reports', 'watchdog-latest.json'));
  return watchdog?.alerts ?? [];
}

function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  const critical = [
    'TIKTOK_ACCESS_TOKEN', 'ROUTER_PORT', 'STRIPE_WEBHOOK_PORT',
    'CEO_WALLET_BUDGET_USDC', 'AVATAR_ENABLED',
  ];
  for (const key of critical) {
    if (!process.env[key]) missing.push(key);
  }
  return missing;
}

function getGateState(): { postsDelivered: number; daysLeft: number; urgency: string } {
  const gate = readJSON<any>(path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json'));
  return {
    postsDelivered: gate?.raw?.posts_count ?? 0,
    daysLeft: gate?.days_remaining ?? 18,
    urgency: gate?.urgency ?? 'UNKNOWN',
  };
}

function getPipelineErrors(): string[] {
  const errors: string[] = [];
  const logDir = path.join(ROOT, 'logs');
  const errorFiles = [
    'pipeline-error.log', 'scs001-pipeline-error.log',
    'daily-digest-error.log', 'gate-regen-error.log',
  ];
  for (const f of errorFiles) {
    const p = path.join(logDir, f);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf-8').trim();
    if (content.length > 0) {
      const lastLine = content.split('\n').pop() ?? '';
      if (lastLine.includes('Error') || lastLine.includes('error')) {
        errors.push(`${f}: ${lastLine.slice(0, 120)}`);
      }
    }
  }
  return errors;
}

function getExistingCommands(): Set<string> {
  const cmds = new Set<string>();
  try {
    const botFile = fs.readFileSync(path.join(ROOT, 'scripts', 'telegram-bot.ts'), 'utf-8');
    let match: RegExpExecArray | null;
    const caseRe = /case '\/(\w+)'/g;
    while ((match = caseRe.exec(botFile)) !== null) cmds.add(match[1]);
    const asyncRe = /'\/(\w+)'/g;
    while ((match = asyncRe.exec(botFile)) !== null) cmds.add(match[1]);
  } catch {}
  return cmds;
}

function getGitLogTitles(): string[] {
  try {
    const log = execSync('git log --oneline -100', { cwd: ROOT, encoding: 'utf-8' });
    return log.split('\n').filter(Boolean).map(l => l.replace(/^[a-f0-9]+ /, ''));
  } catch { return []; }
}

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000));
}

function generateItems(startSprint: number, existingTitles: Set<string> = new Set()): QueueItem[] {
  const items: QueueItem[] = [];
  let sprint = startSprint;
  const gate = getGateState();
  const alerts = getWatchdogAlerts();
  const errors = getPipelineErrors();
  const existingCmds = getExistingCommands();

  // Dedup: check queue titles AND git log for already-shipped work
  const existingTitleArray = Array.from(existingTitles);
  const gitTitles = getGitLogTitles();
  function isDuplicate(title: string): boolean {
    const normalised = title.toLowerCase().slice(0, 40);
    for (let i = 0; i < existingTitleArray.length; i++) {
      if (existingTitleArray[i].toLowerCase().slice(0, 40) === normalised) return true;
    }
    // Also check git log for shipped sprints with similar titles
    for (const gt of gitTitles) {
      if (gt.toLowerCase().includes(normalised.slice(0, 25))) return true;
    }
    return false;
  }

  // Priority 1: Gate-critical items
  if (gate.postsDelivered === 0 && gate.daysLeft <= 20) {
    items.push({
      sprint: sprint++,
      title: 'GATE — Automated TikTok OAuth token refresh + validation',
      block: 'GATE',
      status: 'pending',
      priority: 'critical',
      rationale: `0/${30} posts, ${gate.daysLeft}d to gate. TikTok token is the blocker for auto-posting.`,
    });
  }

  // Priority 2: Fix pipeline errors
  for (const err of errors.slice(0, 2)) {
    items.push({
      sprint: sprint++,
      title: `BUGFIX — Fix pipeline error: ${err.split(':')[0]}`,
      block: 'BUGFIX',
      status: 'pending',
      priority: 'high',
      rationale: `Pipeline error detected: ${err.slice(0, 100)}`,
    });
  }

  // Priority 3: Watchdog critical alerts
  for (const alert of alerts.filter(a => a.severity === 'critical')) {
    if (alert.title.includes('Zero posts')) continue; // Already handled by gate item
    items.push({
      sprint: sprint++,
      title: `WATCHDOG — Address: ${alert.title}`,
      block: 'WATCHDOG',
      status: 'pending',
      priority: 'high',
      rationale: alert.detail,
    });
  }

  // Priority 4: Infrastructure improvements
  const infraItems: Array<{ title: string; block: string; rationale: string }> = [];

  if (!existingCmds.has('logs')) {
    infraItems.push({
      title: 'INFRA — /logs Telegram command for recent error log tailing',
      block: 'INFRA',
      rationale: 'Operator cannot view error logs from Telegram. Add /logs to tail recent pipeline/bot errors.',
    });
  }

  if (!existingCmds.has('costs')) {
    infraItems.push({
      title: 'INFRA — /costs Telegram command for daily/weekly cost breakdown',
      block: 'INFRA',
      rationale: 'Cost visibility is important for Phase 1 budget tracking. Show model costs, API costs, total spend.',
    });
  }

  if (!existingCmds.has('backtest')) {
    infraItems.push({
      title: 'QUALITY — /backtest command to compare hook formulas by historical QC pass rate',
      block: 'QUALITY',
      rationale: 'A/B test framework exists but lacks easy backtest comparison via Telegram.',
    });
  }

  infraItems.push({
    title: 'INFRA — Pipeline output validator cron (verify captioned videos are playable)',
    block: 'INFRA',
    rationale: 'Pipeline produces videos but no automated check verifies they are playable. Add ffprobe validation step.',
  });

  infraItems.push({
    title: 'QUALITY — Content freshness decay — auto-archive stale queue items older than 7 days',
    block: 'QUALITY',
    rationale: 'Queue items may become stale (old trending topics). Auto-archive after 7 days to keep queue fresh.',
  });

  infraItems.push({
    title: 'INFRA — PM2 process auto-healer — restart failed crons after 3 consecutive failures',
    block: 'INFRA',
    rationale: 'Cron processes may fail silently. Auto-healer detects 3+ failures and restarts with Telegram alert.',
  });

  infraItems.push({
    title: 'PHASE2 — Achiri conversation analytics dashboard data export',
    block: 'PHASE2',
    rationale: 'Achiri is at 100% readiness. Export conversation analytics (DAU, retention, topics) as JSON for future web dashboard.',
  });

  infraItems.push({
    title: 'INFRA — Cross-platform posting: YouTube Shorts upload support',
    block: 'INFRA',
    rationale: 'YouTube credentials are configured. Adding Shorts upload doubles content reach and accelerates view count for gate.',
  });

  // Launch-aware items based on upcoming dates
  const godmanDays = daysUntil('2026-04-14');
  const achiriDays = daysUntil('2026-04-25');

  if (godmanDays > 0 && godmanDays <= 25) {
    infraItems.push({
      title: 'GODMAN-LAUNCH — Pre-launch checklist validation + npm publish dry-run',
      block: 'GODMAN-PROTOCOLS',
      rationale: `Godman launch in ${godmanDays}d (Apr 14). Validate all 7 protocols build clean, run npm publish --dry-run, verify X thread assets.`,
    });
  }

  if (achiriDays > 0 && achiriDays <= 35) {
    infraItems.push({
      title: 'ACHIRI-ALPHA — Pre-launch smoke test + waitlist notification prep',
      block: 'PHASE2',
      rationale: `Achiri alpha launch in ${achiriDays}d (Apr 25). Run full E2E test suite, verify waitlist users can be notified, test onboarding flow.`,
    });
  }

  // --- Phase 2: Launch window sprint templates (added Sprint 1046) ---
  // Godman post-publish items
  if (godmanDays > 0 && godmanDays <= 30) {
    infraItems.push({
      title: 'GODMAN-LAUNCH — npm provenance + publish checklist script for all 8 packages',
      block: 'GODMAN-PROTOCOLS',
      rationale: `Godman launch in ${godmanDays}d. Build a publish-all.sh that runs npm publish in correct order (protocols first, then SDK). Add --provenance flag for npm trust scores.`,
    });
    infraItems.push({
      title: 'GODMAN-LAUNCH — CHANGELOG.md for each protocol package (v0.2.0 initial release)',
      block: 'GODMAN-PROTOCOLS',
      rationale: `npm shows CHANGELOG if present. Add CHANGELOG.md to all 8 packages documenting v0.2.0 feature set for first-time visitors.`,
    });
    infraItems.push({
      title: 'GODMAN-LAUNCH — /godman-thread: add copy-paste instructions to Telegram output',
      block: 'GODMAN-PROTOCOLS',
      rationale: `Make /godman-thread output include "tap each tweet to copy" tip and thread summary line count. Reduce friction for X launch day.`,
    });
  }

  if (achiriDays > 0 && achiriDays <= 40) {
    infraItems.push({
      title: 'ACHIRI-ALPHA — Bot startup health check script + pm2 start instructions',
      block: 'PHASE2',
      rationale: `Once ACHIRI_TELEGRAM_BOT_TOKEN is set, operator needs one command to start achiri-telegram. Add scripts/achiri/start-bot.sh with health check and pm2 ecosystem entry.`,
    });
    infraItems.push({
      title: 'ACHIRI-ALPHA — Onboarding message A/B test: cultural vs. universal tone',
      block: 'PHASE2',
      rationale: `Achiri has 10/10 voice validation. Before alpha, A/B test two onboarding message variants (Tunisian cultural greetings vs. universal) to maximise retention.`,
    });
  }

  // Gate pace items
  const postsDelivered = gate.postsDelivered;
  if (postsDelivered < 30 && gate.daysLeft <= 14) {
    infraItems.push({
      title: 'GATE — Daily posting obligation badge in /status: posts today vs target',
      block: 'GATE',
      rationale: `Gate pace is critical (${postsDelivered}/30 with ${gate.daysLeft}d left). Add today's posted count vs daily target to /status header so operator sees it every check-in.`,
    });
    infraItems.push({
      title: 'GATE — Auto-caption batch: pre-generate captions for top 5 unposted videos',
      block: 'GATE',
      rationale: `Reduce friction for manual posting. Run /bulk-captions automatically and save to workspace/scs001/ready-captions.json so /caption-next shows pre-written text instantly.`,
    });
  }

  // SCS-001 pipeline quality
  infraItems.push({
    title: 'QUALITY — Entertainment pipeline integration: register assembler + scriptgen in PM2',
    block: 'SCS001',
    rationale: 'entertainment-assembler.ts and entertainment-scriptgen.ts are untracked. Add as PM2 process or scheduled job to unlock entertainment content format alongside code-demo.',
  });

  infraItems.push({
    title: 'QUALITY — /errors command: show last 5 PM2 error log lines per process',
    block: 'INFRA',
    rationale: 'Operator has /logs but it tails generic logs. Add /errors to show last error line from each PM2 process that logged an error in last 24h. Much faster triage.',
  });

  infraItems.push({
    title: 'OPS — Daily brief task generator: replace stale timeline tasks with live system state',
    block: 'OPS',
    rationale: 'generate-daily-brief.py pulls TODAY tasks from KOGNAI_DAILY_TIMELINE.md which is months old. Replace with dynamic task list derived from gate state, blockers, and launch countdown.',
  });

  infraItems.push({
    title: 'INFRA — /sprint-next: show next planned sprint title + rationale from queue',
    block: 'INFRA',
    rationale: 'When queue is empty, operator has no visibility into what Claude Code will work on next. /sprint-next shows top pending item or "queue empty — run /replenish".',
  });

  infraItems.push({
    title: 'QUALITY — Trust score auditor: flag agents with score < 0.6 in /status health',
    block: 'QUALITY',
    rationale: 'acp/trust-scores.json tracks agent trust. No alerting exists when an agent drops below acceptable threshold. Add check to daily digest + /status.',
  });

  infraItems.push({
    title: 'INFRA — Revenue tracker: /revenue shows TikTok Agent subscription MRR from Stripe',
    block: 'INFRA',
    rationale: '/revenue command exists but may not show live Stripe data. Verify it reads from Stripe webhook events and shows MRR, new subs this week, churn rate.',
  });

  // --- Phase 3: Post-launch maintenance sprints (added Sprint 1059) ---
  infraItems.push({
    title: 'OPS — Watchdog alerts in /status: show critical alerts if any',
    block: 'INFRA',
    rationale: 'reports/watchdog-latest.json has alerts array. If any critical alerts exist, surface them in /status so operator sees them immediately without running /health.',
  });

  infraItems.push({
    title: 'GATE — /today morning auto-send: PM2 cron pushes /today brief to Telegram at 07:05',
    block: 'GATE',
    rationale: 'Operator must manually type /today each morning. Add PM2 cron (scs001-morning-brief) that auto-sends /today output to operator chat at 07:05 to start each day with context.',
  });

  infraItems.push({
    title: 'QUALITY — /godman: verify all 7 readiness checks are accurate pre-launch',
    block: 'GODMAN-PROTOCOLS',
    rationale: `Godman launch in ${daysUntil('2026-04-14')}d. Run /godman and audit each check: badge links, api.md completeness, CHANGELOG presence, publish script, smoke tests passing.`,
  });

  infraItems.push({
    title: 'INFRA — Stripe webhook event log: /stripe command shows last 5 webhook events',
    block: 'INFRA',
    rationale: 'No visibility into Stripe webhook delivery. Add /stripe command that tails stripe-webhook-out.log last 5 lines — shows subscription.created, payment_intent.succeeded events.',
  });

  infraItems.push({
    title: 'OPS — Session log auto-template: /log command creates pre-filled session log entry',
    block: 'OPS',
    rationale: 'Session logs are required at end of each PM block but must be typed manually. /log command outputs a pre-filled template with today date, latest sprint, and gate status to paste into workspace/agents/memory/.',
  });

  infraItems.push({
    title: 'QUALITY — Video expiry checker: /stale shows queue items older than 14 days',
    block: 'QUALITY',
    rationale: 'Video topics become stale after ~2 weeks. /stale command exists but may not show age. Verify it shows days-old for each item and auto-suggests /archive for items > 14d.',
  });

  infraItems.push({
    title: 'INFRA — /health: add Ollama model availability check to health dashboard',
    block: 'INFRA',
    rationale: '/health shows PM2 procs but not Ollama model status. Add check: ping localhost:11434/api/tags and show which models are loaded (qwen3:0.6b, qwen3:4b, deepseek-r1:14b).',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman-smoke: detailed failure output when a protocol test fails',
    block: 'GODMAN-PROTOCOLS',
    rationale: '/godman-smoke runs smoke tests but output is terse on failure. Add per-protocol test output showing which assertion failed so operator can debug before launch day.',
  });

  infraItems.push({
    title: 'PHASE2 — Achiri: validate-derja-profiler test coverage report via /achiri',
    block: 'PHASE2',
    rationale: 'Achiri derja profiler was added in Sprint 133. Run scripts/achiri/validate-derja-profiler.ts and surface pass/fail in /achiri readiness section.',
  });

  infraItems.push({
    title: 'OPS — Daily digest: add gate posting obligation to 07:00 digest output',
    block: 'OPS',
    rationale: 'kognai-daily-digest runs at 07:00 but may not surface the posting obligation. Ensure digest includes "Post N videos today (X/30 gate)" as the first action item.',
  });

  // --- Phase 4: Post-1068 maintenance + pre-gate hardening (added Sprint 1069) ---
  infraItems.push({
    title: 'QUALITY — /godman-smoke: show per-protocol test output on failure',
    block: 'GODMAN-PROTOCOLS',
    rationale: `/godman-smoke runs smoke tests but output is terse on failure. Add per-protocol assertion detail so operator can debug before launch day (${daysUntil('2026-04-14')}d).`,
  });

  infraItems.push({
    title: 'GATE — /record: validate video_id exists in auto-delivered before recording',
    block: 'GATE',
    rationale: 'Operator sometimes mistypes /record IDs. Add a check that the video_id exists in auto-delivered.jsonl before writing to manual-posts.jsonl, with a warning if not found.',
  });

  infraItems.push({
    title: 'OPS — /status: add Godman launch countdown to ops section',
    block: 'GODMAN-PROTOCOLS',
    rationale: `Godman launches ${daysUntil('2026-04-14')}d from now. Add a single line to /status showing "Godman: Nd to launch · npm login required" so it's never out of sight.`,
  });

  infraItems.push({
    title: 'INFRA — /crons: flag crons that have not fired in >25h',
    block: 'INFRA',
    rationale: 'PM2 crons can silently stop firing after server restart. /crons shows process status but not last-fire time. Add staleness check: if cron has been online >25h without output, flag it.',
  });

  infraItems.push({
    title: 'QUALITY — Smoke test gate: add to morning brief if last smoke was >24h ago',
    block: 'QUALITY',
    rationale: 'morning-brief sends gate + video pick but not smoke test status. If reports/smoke-test-latest.json is >24h old, add a warning line so operator knows to re-run smoke.',
  });

  infraItems.push({
    title: 'PHASE2 — Achiri /reengage: surface daily re-engagement count in /achiri',
    block: 'PHASE2',
    rationale: 'workspace/achiri/reengage-log.jsonl tracks re-engagement events. Add a line to /achiri showing how many users were re-engaged today vs yesterday.',
  });

  infraItems.push({
    title: 'OPS — /costs: add Ollama inference cost estimate (tokens * model rate)',
    block: 'OPS',
    rationale: '/costs shows cloud API costs but not local Ollama. Add estimate: read inference logs if available, else show "0.00 (local)" to make the $0 local cost explicit.',
  });

  infraItems.push({
    title: 'INFRA — /health: add last heartbeat age warning if >10 min stale',
    block: 'INFRA',
    rationale: 'health.json heartbeat can be stale without anyone noticing. Add a warning line to /health if last_heartbeat is >10 min old: "⚠️ Stale heartbeat: Nm ago".',
  });

  infraItems.push({
    title: 'GATE — /today: show daily obligation met vs pending with count breakdown',
    block: 'GATE',
    rationale: '/today shows gate progress but not whether today\'s obligation is met. Add "Today: X/Y posted (obligation met ✅)" to /today output next to gate progress line.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — Pre-launch smoke: verify all 7 protocol packages build clean',
    block: 'GODMAN-PROTOCOLS',
    rationale: `With ${daysUntil('2026-04-14')}d to launch, run npm run build in all 7 protocol dirs + SDK and confirm zero TypeScript errors. Add to /godman output as build-clean check.`,
  });

  // Fill remaining slots (skip duplicates of already-completed items)
  for (const item of infraItems) {
    if (items.length >= 10) break;
    if (isDuplicate(item.title)) continue;
    items.push({
      sprint: sprint++,
      title: item.title,
      block: item.block,
      status: 'pending',
      priority: 'medium',
      rationale: item.rationale,
    });
  }

  return items;
}

function main(): void {
  const DRY_RUN = process.env.REPLENISH_DRY_RUN === '1';
  const queuePath = path.join(ROOT, 'workspace', 'sprint-queue.json');

  const existing = readJSON<QueueFile>(queuePath);
  if (!existing) {
    console.error('[replenish] Could not read sprint-queue.json');
    process.exit(1);
  }

  // Check if there are pending items
  const pending = existing.queue.filter(i => !['done', 'skipped', 'skip'].includes(i.status));
  if (pending.length > 0) {
    console.log(`[replenish] Queue has ${pending.length} pending items. No replenishment needed.`);
    return;
  }

  const lastSprint = getLastSprintNumber();
  const startSprint = lastSprint + 2; // +2 because current sprint is lastSprint+1
  const existingTitles = new Set(existing.queue.map(i => i.title));
  const newItems = generateItems(startSprint, existingTitles);

  console.log(`\n=== Sprint Queue Replenisher ===`);
  console.log(`Last shipped: Sprint ${lastSprint}`);
  console.log(`Generating ${newItems.length} queue items starting at Sprint ${startSprint}\n`);

  for (const item of newItems) {
    const icon = item.priority === 'critical' ? '🔴' : item.priority === 'high' ? '🟠' : '🟢';
    console.log(`${icon} Sprint ${item.sprint}: ${item.title}`);
    console.log(`  ${item.rationale}\n`);
  }

  if (DRY_RUN) {
    console.log('[replenish] Dry run — not writing to queue file.');
    return;
  }

  // Append new items to queue
  existing.queue.push(...newItems);
  existing.updated = new Date().toISOString().slice(0, 16);
  existing._plan_rationale = `Auto-replenished ${new Date().toISOString().slice(0, 10)}: ${newItems.length} items generated by replenish-sprint-queue.ts. Based on watchdog alerts, gate state (${getGateState().postsDelivered}/30 posts, ${getGateState().daysLeft}d), and infra gaps.`;

  fs.writeFileSync(queuePath, JSON.stringify(existing, null, 2));
  console.log(`[replenish] Wrote ${newItems.length} items to sprint-queue.json`);
}

// Export for Telegram command
export { main as replenishQueue, generateItems, getLastSprintNumber };

main();
