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

  // --- Phase 5: Pre-gate polish + Godman pre-launch (added Sprint 1078) ---
  infraItems.push({
    title: 'GODMAN-LAUNCH — Pre-launch build verify: npm run build clean for all 8 packages',
    block: 'GODMAN-PROTOCOLS',
    rationale: `${daysUntil('2026-04-14')}d to Godman launch. Run npm run build in all 7 protocol dirs + SDK to confirm zero TypeScript errors. Surface build status in /godman output.`,
  });

  infraItems.push({
    title: 'GATE — /blockers: show top 3 actionable unblocks with sprint IDs',
    block: 'GATE',
    rationale: '/blockers exists but may show stale items. Refresh to show only items that have no open code fix (non-code blockers only): missing tokens, manual posting needed, gate math.',
  });

  infraItems.push({
    title: 'OPS — /status: Godman 21d countdown line in launch section',
    block: 'GODMAN-PROTOCOLS',
    rationale: `Godman npm launch in ${daysUntil('2026-04-14')}d. /status shows TikTok gate but not Godman. Add a "Godman: Nd to launch · npm login needed" line to the ops section.`,
  });

  infraItems.push({
    title: 'INFRA — /errors: deduplicate repeated error lines (show count instead)',
    block: 'INFRA',
    rationale: '/errors can show the same error repeated many times if a process looped. Add dedup: show "Error X (×N)" instead of N identical lines. Cap output at 8 entries.',
  });

  infraItems.push({
    title: 'QUALITY — /smoke: surface in /status as "Smoke: ✅ clean / ❌ failing"',
    block: 'QUALITY',
    rationale: 'Smoke test result is in reports/smoke-test-latest.json but /status only shows PM2 and gate. Add one-line smoke status to /status header section.',
  });

  infraItems.push({
    title: 'PHASE2 — Achiri: /alpha readiness: verify all 5 pre-alpha checks pass',
    block: 'PHASE2',
    rationale: `Achiri alpha launches ${daysUntil('2026-04-25')}d from now. Run scripts/achiri/achiri-readiness.ts and verify all critical checks pass. Fix any that don't.`,
  });

  infraItems.push({
    title: 'GATE — /pace: show required daily post rate vs current streak',
    block: 'GATE',
    rationale: 'Gate pace check — show "Need X/day · Currently posting Y/day (streak: Zd)" to quickly assess if operator is on track. Read from manual-posts.jsonl last 7d.',
  });

  infraItems.push({
    title: 'OPS — /digest: add Godman + Achiri launch countdown to bottom of digest',
    block: 'OPS',
    rationale: 'kognai-daily-digest has gate countdown but not Godman/Achiri launch dates. Add "Godman: Nd · Achiri: Nd" footer to keep upcoming launches visible daily.',
  });

  infraItems.push({
    title: 'INFRA — /health: show PM2 memory usage warning if any process >500MB',
    block: 'INFRA',
    rationale: 'PM2 processes can leak memory. /health shows PM2 status but not per-process memory. Add warning if any process exceeds 500MB RSS.',
  });

  infraItems.push({
    title: 'QUALITY — /queue: show viral score next to each item + age in days',
    block: 'QUALITY',
    rationale: '/queue shows video IDs and ready count but not viral score or how old each item is. Add score + age so operator can prioritize what to post first.',
  });

  // Wave 6 templates — pre-launch polish + Achiri + gate
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: verify changelog is present (CHANGELOG.md in each protocol)',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'Each protocol repo needs a CHANGELOG.md before npm publish. /godman readiness should check all 7 repos have CHANGELOG.md and show pass/fail per protocol.',
  });

  infraItems.push({
    title: 'OPS — /status: show days since last post in header if streak is 0',
    block: 'OPS',
    rationale: 'When streak is 0, /status should show how many days since the last post (e.g. "Last post: 3d ago") to give the operator urgency context.',
  });

  infraItems.push({
    title: 'INFRA — /errors: add timestamp of earliest and latest error in 24h window',
    block: 'INFRA',
    rationale: '/errors shows the most recent error per process but not the time range. Adding "first seen / last seen" timestamps helps triage whether errors are recurring or one-off.',
  });

  infraItems.push({
    title: 'PHASE2 — /achiri: show reengage failure rate (failed vs sent)',
    block: 'ACHIRI',
    rationale: '/achiri shows reengage count but not how many failed. reengage-log.jsonl has status field. Show sent/failed ratio so operator knows if bot is having delivery issues.',
  });

  infraItems.push({
    title: 'GATE — /today: add views-needed line when gate is not met',
    block: 'GATE',
    rationale: '/today shows post obligation but not how many views are still needed. When views < 500, add a line: "Views still needed: X / 500" to remind operator to track engagement.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: add Godman countdown to brief when ≤14d to launch',
    block: 'OPS',
    rationale: 'Morning brief covers TikTok gate but not Godman launch. When Godman launch is ≤14d away, inject a countdown line so operator stays aware.',
  });

  infraItems.push({
    title: 'QUALITY — /smoke: show last run timestamp in output',
    block: 'QUALITY',
    rationale: '/smoke shows pass/fail but not when it last ran. Add "Last run: Xh ago" to the output so operator knows if the smoke test data is fresh.',
  });

  infraItems.push({
    title: 'INFRA — /health: highlight if PM2 process has >100 restarts',
    block: 'INFRA',
    rationale: 'Processes with >100 restarts are unstable. /health shows heartbeat state but not per-process restart count. Add a warning line for any process with excessive restarts.',
  });

  infraItems.push({
    title: 'OPS — /blockers: sort by severity (CRITICAL → HIGH → MEDIUM)',
    block: 'OPS',
    rationale: '/blockers shows items but not sorted by severity. When there are multiple blockers, show CRITICAL items first so operator addresses most impactful items first.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: check npm pack --dry-run passes for each protocol',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'Before npm publish on Apr 14, each protocol should pass `npm pack --dry-run`. Add a check to /godman that runs pack dry-run and shows which protocols are publish-ready.',
  });

  // Wave 7 templates — final pre-launch + Achiri polish
  infraItems.push({
    title: 'OPS — /crons: show next fire time for each PM2 cron job',
    block: 'OPS',
    rationale: '/crons shows cron expressions but not when each job fires next. Add "next: Xh Ym" column so operator knows if daily jobs will run on schedule.',
  });

  infraItems.push({
    title: 'GATE — /status: show views/500 progress bar like posts progress bar',
    block: 'GATE',
    rationale: '/status has a post count progress bar but not a views progress bar. Add a compact views bar: [███░░░] 0/500 to make views tracking visual.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show days until launch in header (e.g. "21d to launch")',
    block: 'GODMAN-PROTOCOLS',
    rationale: '/godman readiness report has no header countdown. Add "🚀 Launch in Nd (Apr 14)" as the first line so operator always sees urgency at a glance.',
  });

  infraItems.push({
    title: 'INFRA — /report: add gate progress (posts + views) to system report',
    block: 'INFRA',
    rationale: '/report shows PM2, health, sprint but not the Phase 1.5 gate progress. Adding posts/30 + views/500 gives operator a full picture without switching to /status.',
  });

  infraItems.push({
    title: 'PHASE2 — /achiri: show total messages handled + daily avg',
    block: 'ACHIRI',
    rationale: '/achiri shows DAU and users but not total lifetime messages or daily average message volume. Adding these metrics helps assess conversation quality before alpha.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: add views progress to brief if views <100',
    block: 'OPS',
    rationale: 'Morning brief focuses on posts but not views. When views < 100 (far from 500 gate), add a line "Views: X/500 — engagement lag" to flag this early.',
  });

  infraItems.push({
    title: 'QUALITY — /bottest: add /pace and /today command smoke tests',
    block: 'QUALITY',
    rationale: '/bottest tests core commands but not /pace or /today which were recently added. Add these to the smoke test suite to catch regressions.',
  });

  infraItems.push({
    title: 'INFRA — /health: show Supabase connection status (ping edge function)',
    block: 'INFRA',
    rationale: '/health shows local checks but not Supabase connectivity. Add a 2s ping to the Supabase URL (from .env) so operator can detect DB connection issues early.',
  });

  infraItems.push({
    title: 'OPS — /digest: show yesterday post count vs target in header',
    block: 'OPS',
    rationale: 'Daily digest starts with gate math but not what actually happened yesterday. Add "Yesterday: N posts posted" as the second line so operator can see recent activity.',
  });

  infraItems.push({
    title: 'GATE — /gate: add urgency emoji escalation based on days remaining',
    block: 'GATE',
    rationale: '/gate shows days remaining but urgency is text-only. Add escalating emoji: 🟢 ≥14d, 🟡 7-13d, 🟠 3-6d, 🔴 <3d for quick visual triage.',
  });

  // Wave 8 templates — operational polish + pre-launch hardening
  infraItems.push({
    title: 'OPS — /pace: show gap between obligation and actual posts/day',
    block: 'OPS',
    rationale: '/pace shows current posts/day but not how far above/below the daily obligation it is. Add a delta line "Need: X/day · Actual: Y/day · Gap: +/-Z" for quick triage.',
  });

  infraItems.push({
    title: 'GATE — /today: bold warning when daily obligation not yet met',
    block: 'GATE',
    rationale: '/today shows posts done today but does not visually flag when the daily obligation is unmet. Add "⚠️ OBLIGATION UNMET" banner when todayPosts < dailyObligation.',
  });

  infraItems.push({
    title: 'OPS — /status: add Achiri alpha countdown to ops section',
    block: 'OPS',
    rationale: '/status shows Godman launch countdown but not Achiri alpha (Apr 25). Add "Achiri: Nd to alpha" line alongside Godman to keep both dates visible.',
  });

  infraItems.push({
    title: 'QUALITY — /godman: show per-protocol test pass count in readiness list',
    block: 'GODMAN-PROTOCOLS',
    rationale: '/godman shows build status per protocol but not test counts. Add "X/Y tests pass" per protocol when test output is available to surface regressions.',
  });

  infraItems.push({
    title: 'INFRA — /health: show Mac Mini disk space (vault) in system health',
    block: 'INFRA',
    rationale: '/health checks PM2 and Supabase but not local disk. TTS/video generation fills disk fast. Add df -h check so operator sees vault disk usage before it causes failures.',
  });

  infraItems.push({
    title: 'OPS — /status: show last pipeline run timestamp',
    block: 'OPS',
    rationale: '/status shows video counts but not when the pipeline last ran. Adding "Pipeline: last run Xh ago" catches stalled cron jobs before they become posting blockers.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show last 24h message count separately',
    block: 'ACHIRI',
    rationale: '/achiri shows total and daily avg but not activity in the last 24h. A "Last 24h: N messages" line shows whether the bot is being used right now vs historically.',
  });

  infraItems.push({
    title: 'QUALITY — /bottest: check required env vars are set as smoke test',
    block: 'QUALITY',
    rationale: '/bottest tests command output but not env var prerequisites. Add env var check (TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_CHAT_ID, etc.) so missing vars surface in bottest.',
  });

  infraItems.push({
    title: 'OPS — /digest: add Achiri alpha countdown to digest footer',
    block: 'OPS',
    rationale: 'Daily digest already shows Godman countdown in footer but not Achiri alpha (Apr 25). Add "Achiri: Nd to alpha" alongside Godman so both deadlines are visible each morning.',
  });

  infraItems.push({
    title: 'GATE — /gate: show posts needed per day for rest of window',
    block: 'GATE',
    rationale: '/gate shows total posts needed but not the daily rate. Add "Need X posts/day for remaining Yd" so operator can immediately assess posting intensity required.',
  });

  // Wave 9 templates — Godman pre-launch + engagement hardening
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: warn if any protocol has no tests (missing test script)',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'Some godman protocols may not have a test script. /godman should flag protocols missing npm test so they get coverage before launch.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: show stuck cron warning if any cron is >48h stale',
    block: 'OPS',
    rationale: 'Morning brief shows posting state but not cron health. If any daily cron missed its window (>48h uptime), flag it so operator can restart before the day starts.',
  });

  infraItems.push({
    title: 'GATE — /record: confirm receipt with gate progress after each post',
    block: 'GATE',
    rationale: '/record logs a post but only shows a simple confirmation. After recording, show "Gate: N/30 posts · M/500 views · Xd left" to reinforce progress.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show error rate (failed messages / total) from reengage log',
    block: 'ACHIRI',
    rationale: '/achiri shows send counts but not what percentage failed. Add error rate % from reengage-error.log so operator can see bot reliability at a glance.',
  });

  infraItems.push({
    title: 'OPS — /status: filter empty lines from output (compact mode)',
    block: 'OPS',
    rationale: '/status has many conditional lines that render as empty strings when undefined. Filter falsy values from the output array to remove blank gaps in the message.',
  });

  infraItems.push({
    title: 'QUALITY — /smoke: add pipeline validator check (validator must pass)',
    block: 'QUALITY',
    rationale: '/smoke runs basic tests but not the pipeline validator. Add a check that runs npx ts-node scripts/validate-pipeline.ts and fails if errors > 0.',
  });

  infraItems.push({
    title: 'INFRA — /health: show Tailscale VPN status (up/down)',
    block: 'INFRA',
    rationale: '/health checks local disk and PM2 but not Tailscale VPN. If Tailscale goes down, Mac Mini vault becomes unreachable. Add tailscale status check.',
  });

  infraItems.push({
    title: 'OPS — /crons: add restart button hint for stuck crons',
    block: 'OPS',
    rationale: 'When /crons shows STALE crons, it should also show the restart command. Add "Restart: pm2 restart <name>" hint next to stuck cron entries.',
  });

  infraItems.push({
    title: 'GATE — /today: show top 3 unposted video IDs with copy-paste /record commands',
    block: 'GATE',
    rationale: '/today shows top picks but the record command requires manual ID lookup. Show 3 pre-filled /record <id> 0 commands at the end of /today for immediate action.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show npm registry status (npmjs.com reachable)',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'Before launch day, /godman should verify npmjs.com is reachable with a quick curl check so operator knows publish will work before attempting it.',
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
