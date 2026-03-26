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
  added_at?: string;  // Sprint 1248: ISO timestamp when item was added to queue
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

// Sprint 1414: max age for pipeline errors to be considered actionable.
// Older errors are stale (already addressed or transient) and should not generate new queue items.
const PIPELINE_ERROR_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

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
        // Sprint 1414: skip stale errors — parse leading timestamp and reject if > 6h old.
        // Log format: "2026-03-25 19:38:55 +01:00: ..."
        const tsMatch = lastLine.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}):/);
        if (tsMatch) {
          const errorAge = Date.now() - new Date(tsMatch[1]).getTime();
          if (errorAge > PIPELINE_ERROR_MAX_AGE_MS) continue; // stale — skip
        }
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

function generateItems(startSprint: number, existingTitles: Set<string> = new Set(), allExistingTitles: Set<string> = new Set()): QueueItem[] {
  const items: QueueItem[] = [];
  let sprint = startSprint;
  const gate = getGateState();
  const alerts = getWatchdogAlerts();
  const errors = getPipelineErrors();
  const existingCmds = getExistingCommands();

  // Sprint 1198: Aggressive dedup — check queue titles, git log, AND keyword matching
  const existingTitleArray = Array.from(existingTitles);
  const gitTitles = getGitLogTitles();
  // Build a keyword index from git log for faster matching
  const gitKeywords = new Set<string>();
  for (const gt of gitTitles) {
    const words = gt.toLowerCase().replace(/[^a-z0-9/\-_ ]/g, '').split(/\s+/);
    for (const w of words) if (w.length > 4) gitKeywords.add(w);
  }
  function isDuplicate(title: string): boolean {
    // Sprint 1248: exact-title match against ALL items (including done/skipped) prevents regenerating completed work
    if (allExistingTitles.has(title)) return true;
    const normalised = title.toLowerCase().slice(0, 40);
    for (let i = 0; i < existingTitleArray.length; i++) {
      if (existingTitleArray[i].toLowerCase().slice(0, 40) === normalised) return true;
    }
    // Check git log for shipped sprints with similar titles (Sprint 1245: raised from 25→35 to reduce false positives)
    const matchKey = normalised.slice(0, 35);
    if (matchKey.length >= 35) {
      for (const gt of gitTitles) {
        if (gt.toLowerCase().includes(matchKey)) return true;
      }
    }
    // Extract /command from title and check if feature was already shipped
    const cmdMatch = title.match(/\/(\w[\w-]*)/);
    if (cmdMatch) {
      const cmd = cmdMatch[1].toLowerCase();
      // Sprint 1245: require 2+ enhancement words to match (avoid false positives from common words)
      const enhancementWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 6);
      for (const gt of gitTitles) {
        const gtLower = gt.toLowerCase();
        if (gtLower.includes('/' + cmd)) {
          const matchCount = enhancementWords.filter(w => gtLower.includes(w)).length;
          if (matchCount >= 2) return true;
        }
      }
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

  // Wave 10 templates — final launch polish + Achiri + observability
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show npmjs.com registry reachability check',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'On launch day, npm publish will fail silently if npmjs.com is unreachable. Add a curl check to verify registry is reachable before /godman shows green.',
  });

  infraItems.push({
    title: 'OPS — /status: show today obligation met/unmet in a single bold line',
    block: 'OPS',
    rationale: '/status shows today posts but the obligation status is not prominent enough. Replace the today line with a bold OBLIGATION MET or OBLIGATION UNMET banner.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show premium conversion rate (premium users / total users)',
    block: 'ACHIRI',
    rationale: '/achiri shows user counts but not premium conversion %. Add "Conversion: X/Y = Z%" to make business metrics visible before alpha launch.',
  });

  infraItems.push({
    title: 'GATE — /gate: show gate status as PASS/FAIL/AT RISK in header',
    block: 'GATE',
    rationale: '/gate shows numbers but not a single PASS/FAIL/AT RISK status. Add a clear status banner at the top so operator gets instant verdict.',
  });

  infraItems.push({
    title: 'OPS — /errors: show total error count in header with time window',
    block: 'OPS',
    rationale: '/errors shows a list but the total count and time window are not prominent. Add "X errors in last 24h" as the first line for quick scanning.',
  });

  infraItems.push({
    title: 'INFRA — /health: show last watchdog run timestamp',
    block: 'INFRA',
    rationale: '/health shows PM2 and disk but not when watchdog last ran. Add "Watchdog: last run Xh ago" to catch cases where the watchdog cron is silently failing.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: skip brief and log reason if Godman already launched',
    block: 'OPS',
    rationale: 'After Apr 14, morning-brief still counts down to a passed date. Skip the Godman section (or show "launched") when the date has passed.',
  });

  infraItems.push({
    title: 'QUALITY — /bottest: add /gate command smoke test',
    block: 'QUALITY',
    rationale: '/bottest doesnt cover /gate. Add a smoke test that calls cmdGate() and checks that the response contains "Phase 1.5 Gate".',
  });

  infraItems.push({
    title: 'OPS — /weekly-report: add views per day average for the week',
    block: 'OPS',
    rationale: '/weekly-report shows posts per week but not views velocity. Add "Views this week: N total · X/day avg" to track engagement trend.',
  });

  infraItems.push({
    title: 'GATE — /pace: show daily post target for today (not just overall pace)',
    block: 'GATE',
    rationale: '/pace shows overall pace and needed pace but not "you need to post X videos today". Add a "Post X more today" action line based on posts done today vs daily obligation.',
  });

  // Wave 11 templates — post-launch + phase 2 readiness
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show publish status badge (published to npm / not yet)',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'After npm publish, /godman should show a published badge per protocol. Check npm registry for latest version to distinguish pre-launch from post-launch state.',
  });

  infraItems.push({
    title: 'OPS — /status: add gate ETA to posts section (projects date posts will hit 30)',
    block: 'OPS',
    rationale: '/status shows posts/30 but not ETA. At current pace, it should project the date when posts will reach 30, e.g. "ETA: Apr 5" or "ETA: missed" if gate date has passed.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show days to alpha countdown prominently in header',
    block: 'ACHIRI',
    rationale: '/achiri shows days buried in the status line. Move "Nd to alpha launch" to be the second line after the status icon so it is the first thing operator sees.',
  });

  infraItems.push({
    title: 'GATE — /weekly-report: show views per day this week vs target',
    block: 'GATE',
    rationale: '/weekly-report shows post count but not views velocity. Add views/day for the week and compare to what is needed to hit 500 total.',
  });

  infraItems.push({
    title: 'OPS — /errors: show which PM2 process has the most errors in summary',
    block: 'OPS',
    rationale: '/errors groups by type but not by process. Show "Top error source: <process-name> (N errors)" so operator knows where to focus first.',
  });

  infraItems.push({
    title: 'INFRA — /health: show Node.js and npm versions',
    block: 'INFRA',
    rationale: '/health shows process info but not runtime versions. Node.js version mismatches can cause silent failures. Add "Node: vX.Y.Z · npm: X.Y.Z" to the health report.',
  });

  infraItems.push({
    title: 'OPS — /crons: show last output snippet from stuck cron log',
    block: 'OPS',
    rationale: 'When /crons shows a stuck cron, operator has no hint why it is stuck. Show last 1-2 lines from the cron process error log alongside the restart hint.',
  });

  infraItems.push({
    title: 'GATE — /record: warn if views is unusually high (>10k) — possible typo',
    block: 'GATE',
    rationale: 'Operators sometimes enter view counts with extra zeros (e.g. 10000 instead of 100). Add a warning when views > 5000 to confirm before recording.',
  });

  infraItems.push({
    title: 'QUALITY — /smoke: show which tests passed/failed by name not just count',
    block: 'QUALITY',
    rationale: '/smoke shows "X passed, Y failed" but not which tests failed. Extract test names from output and list the failed ones for faster debugging.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: add gate ETA (projected date to hit 30 posts)',
    block: 'OPS',
    rationale: 'Morning brief shows posts done and days left but not the projected date when gate will be met at current pace. Add ETA to help operator visualize trajectory.',
  });

  // Wave 12 templates — mature operations + Achiri prep
  infraItems.push({
    title: 'OPS — /status: show time since last post in the queue section',
    block: 'OPS',
    rationale: '/status shows streak but not how long ago the last post was when streak is 0. Add "Last post: Xh ago" or "Last post: today" near the queue section for quick ops check.',
  });

  infraItems.push({
    title: 'GATE — /today: show yesterday views total alongside today gate stats',
    block: 'GATE',
    rationale: '/today shows cumulative views but not yesterday specifically. Adding "Yesterday: N views" helps operator see if a post is gaining traction day-over-day.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show test suite pass rate from achiri-test-suite.json',
    block: 'ACHIRI',
    rationale: '/achiri shows readiness % but not test suite results. Adding test pass rate from reports/achiri-test-suite.json makes quality visible before alpha.',
  });

  infraItems.push({
    title: 'INFRA — /report: add Achiri test suite status to system report',
    block: 'INFRA',
    rationale: '/report shows gate progress but not Achiri test quality. Adding test pass/fail from achiri-test-suite.json gives full picture of system health.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: show unposted video count (queue depth)',
    block: 'OPS',
    rationale: 'Morning brief shows posts done but not how many unposted videos are ready. Adding "Queue: N videos ready to post" motivates operator to use pipeline output.',
  });

  infraItems.push({
    title: 'QUALITY — /smoke: add memory check (warn if PM2 processes exceed 512MB)',
    block: 'QUALITY',
    rationale: '/smoke tests pipeline but not memory health. Add a check that flags PM2 processes using >512MB heap so memory leaks are caught early.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: check git tag matches package.json version per protocol',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'On launch day, git tags and package.json versions should match for all protocols. Add a version consistency check to catch drift before publishing.',
  });

  infraItems.push({
    title: 'OPS — /errors: add filter by process name (/errors <process>)',
    block: 'OPS',
    rationale: '/errors shows all process errors. When debugging a specific process, operator must scroll past others. Add optional filter: /errors achiri shows only achiri errors.',
  });

  infraItems.push({
    title: 'GATE — /record: auto-suggest next /view-update command after recording',
    block: 'GATE',
    rationale: 'After recording a post, operator should schedule a view update in 24-48h. Add "Run /view-update <id> tomorrow to track views" to the confirmation message.',
  });

  infraItems.push({
    title: 'OPS — /weekly-report: compare this week vs last week post count',
    block: 'OPS',
    rationale: '/weekly-report shows this week total but not growth. Add "vs last week: +N / -N posts" to show if posting is accelerating or slowing down.',
  });

  // Wave 13 templates — advanced ops + launch prep
  infraItems.push({
    title: 'OPS — /status: show Achiri alpha countdown in header',
    block: 'OPS',
    rationale: '/status shows Godman and Achiri lines but Achiri days are buried. Show Achiri alpha countdown with urgency icon in the header section for visibility.',
  });

  infraItems.push({
    title: 'GATE — /today: show pace comparison (posts/day vs needed/day)',
    block: 'GATE',
    rationale: '/today shows gate stats but not pace vs target. Adding "X/day actual vs Y/day needed" makes the gap immediately actionable.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show total published package count',
    block: 'GODMAN-LAUNCH',
    rationale: '/godman shows per-protocol test status but not how many packages are published to npm. Add total count: "N/8 packages published".',
  });

  infraItems.push({
    title: 'OPS — /health: show memory usage per PM2 process in table',
    block: 'OPS',
    rationale: '/health shows total memory but not per-process breakdown. Show top 5 processes by memory to identify leaks early.',
  });

  infraItems.push({
    title: 'QUALITY — /errors: show error trend (up/flat/down vs yesterday)',
    block: 'QUALITY',
    rationale: '/errors shows current errors but not trend. Adding "vs yesterday: +N / -N errors" shows if things are improving or degrading.',
  });

  infraItems.push({
    title: 'OPS — /weekly-report: show views per post average',
    block: 'OPS',
    rationale: '/weekly-report shows total views but not efficiency. Add "avg views/post: N" so operator can see if content quality is improving.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show last active user timestamp',
    block: 'ACHIRI',
    rationale: '/achiri shows total messages but not when the last real user interaction happened. Add "last active: Xh ago" to show engagement recency.',
  });

  infraItems.push({
    title: 'OPS — /crons: show expected next fire time for each cron',
    block: 'OPS',
    rationale: '/crons shows cron status but not when each will next fire. Adding next-fire time helps operator know when to expect results.',
  });

  infraItems.push({
    title: 'GATE — /gate: show views needed per remaining day',
    block: 'GATE',
    rationale: '/gate shows total views needed but not the daily view rate required. Add "need X views/day" to make the target concrete.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: add Achiri status line when alpha <7d away',
    block: 'OPS',
    rationale: 'Morning brief focuses on TikTok gate but ignores Achiri alpha deadline. When <7d to alpha, add a line prompting /achiri check.',
  });

  // Wave 14 templates — post-launch monitoring + Godman + Achiri hardening
  infraItems.push({
    title: 'OPS — /status: show smoke test age in the status block',
    block: 'OPS',
    rationale: '/status shows smoke status (pass/fail) but not how old the last run is. Add "last: Xh ago" to make staleness visible without opening /smoke.',
  });

  infraItems.push({
    title: 'GATE — /gate: show posts-per-day over the last 7 days',
    block: 'GATE',
    rationale: '/gate shows total pace but not recent posting rhythm. Adding "last 7d: X posts/day" gives a real-world view of current momentum.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: check npm publish dry-run per protocol',
    block: 'GODMAN-LAUNCH',
    rationale: '/godman checks tests and git tags but not if each package is publishable. Run "npm publish --dry-run" per protocol and show which ones are blocked.',
  });

  infraItems.push({
    title: 'OPS — /daily-digest: add Achiri message count delta vs previous day',
    block: 'OPS',
    rationale: 'Daily digest shows today\'s stats but not growth. Adding "Achiri: +N msgs vs yesterday" shows if engagement is growing.',
  });

  infraItems.push({
    title: 'QUALITY — /smoke: add Telegram bot ping check',
    block: 'QUALITY',
    rationale: '/smoke tests pipeline components but not the Telegram bot itself. Add a check that verifies the bot token is valid by calling getMe API.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show waitlist count and conversion funnel',
    block: 'ACHIRI',
    rationale: '/achiri shows premium conversion but not waitlist size. Add "waitlist: N" and a simple funnel: waitlist → active → premium.',
  });

  infraItems.push({
    title: 'OPS — /health: show whether Hetzner VPS is reachable via Tailscale',
    block: 'OPS',
    rationale: '/health shows Tailscale status but not if the Hetzner VPS IP is reachable. Add a ping check to the VPS Tailscale IP.',
  });

  infraItems.push({
    title: 'OPS — /errors: show total error count delta over last 7 days',
    block: 'OPS',
    rationale: '/errors shows 24h errors but not weekly trend. Add "this week: N errors vs last week: M" to catch gradual degradation.',
  });

  infraItems.push({
    title: 'GATE — /record: show cumulative views progress bar after recording',
    block: 'GATE',
    rationale: 'After recording a post, operator has no visual on overall progress. Show a mini progress bar: [██░░░] 40% views toward gate.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: suppress brief when gate is already met',
    block: 'OPS',
    rationale: 'Once gate is met (30 posts + 500 views), the morning brief is noise. Send a celebratory message once then skip until Phase 2 starts.',
  });

  // Wave 15 templates — post-gate Phase 2 readiness + hardening
  infraItems.push({
    title: 'OPS — /status: add Phase 2 readiness line after gate is met',
    block: 'OPS',
    rationale: 'Once Phase 1.5 gate is met, /status should pivot to show Phase 2 readiness checklist (Achiri alpha, Godman launch). Currently shows Phase 1.5 data even after gate met.',
  });

  infraItems.push({
    title: 'GATE — /gate: show hours since last post (not just days)',
    block: 'GATE',
    rationale: 'When posting daily, /gate shows "X days left" but the last post could be 20h ago. Show "last post: Xh ago" to nudge posting rhythm intraday.',
  });

  infraItems.push({
    title: 'OPS — /health: show PM2 restart rate (restarts per hour)',
    block: 'OPS',
    rationale: '/health shows total restarts but not rate. A process with 50 restarts in 1h is a crisis; 50 restarts in 30d is normal. Show restarts/hour for high-restart processes.',
  });

  infraItems.push({
    title: 'QUALITY — /bottest: add /record smoke test with dummy data',
    block: 'QUALITY',
    rationale: '/bottest validates bot commands but not /record write path. Add a dry-run check that /record parses args correctly and returns expected format without writing.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show top 3 most active users (message count)',
    block: 'ACHIRI',
    rationale: 'Achiri shows DAU and total users but not who the power users are. Showing top 3 (anonymized as user_abc) reveals if engagement is spread or concentrated.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show days since each protocol last committed',
    block: 'GODMAN-LAUNCH',
    rationale: '/godman shows test status but not code freshness. A protocol not committed in 7d before launch is a risk. Show "last commit: Xd ago" per protocol.',
  });

  infraItems.push({
    title: 'OPS — /weekly-report: show average posting time of day',
    block: 'OPS',
    rationale: '/weekly-report shows total posts but not when they are posted. Show "avg post time: 7pm" to help operator align with best posting windows.',
  });

  infraItems.push({
    title: 'OPS — /errors: show error log file sizes to identify noisy processes',
    block: 'OPS',
    rationale: '/errors shows recent errors but not which processes have the largest error logs. Show top 3 log files by size to identify runaway loggers.',
  });

  infraItems.push({
    title: 'GATE — /today: show if Telegram bot is responsive (quick ping)',
    block: 'GATE',
    rationale: '/today is the daily action command. If the Telegram bot token is invalid, none of these commands work. Add a quick env check to warn the operator.',
  });

  infraItems.push({
    title: 'OPS — /morning-brief: include Godman launch checklist when <3d away',
    block: 'OPS',
    rationale: 'Morning brief shows Godman countdown but not specific actions needed. When <3d to launch, include checklist: npm login, git tag, publish dry-run.',
  });

  // Wave 16 templates — content quality, Godman publish, Achiri data
  infraItems.push({
    title: 'QUALITY — /smoke: save last smoke result to reports/smoke-test-latest.json',
    block: 'QUALITY',
    rationale: '/smoke runs tests but only shows output in Telegram. Save the result to reports/smoke-test-latest.json so /status can show the latest smoke result without re-running.',
  });

  infraItems.push({
    title: 'OPS — /status: show days since last pipeline run',
    block: 'OPS',
    rationale: '/status shows pipeline last run time but only if very recent. Add "pipeline: Xd ago — consider running" when >3 days to nudge production.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show which protocols are semver-versioned (has package.json version)',
    block: 'GODMAN-LAUNCH',
    rationale: 'Before publishing to npm, each protocol package.json must have a valid semver version field. Show which ones are missing or have 0.0.1 placeholder.',
  });

  infraItems.push({
    title: 'GATE — /pace: show time-boxed daily posting schedule (morning/noon/evening)',
    block: 'GATE',
    rationale: '/pace shows daily obligation as a number but not a time plan. Show "7am · 12pm · 7pm" posting slots to make the obligation actionable.',
  });

  infraItems.push({
    title: 'ACHIRI — /achiri: show last 7 days message trend as sparkline',
    block: 'ACHIRI',
    rationale: 'Achiri daily-counts.json has per-day message totals. Show a 7-day sparkline (▁▂▅▇▆▄▃) to visualize engagement trend at a glance.',
  });

  infraItems.push({
    title: 'OPS — /health: show total PM2 memory footprint',
    block: 'OPS',
    rationale: '/health shows per-process warnings but not the total. Show "Total PM2 memory: X MB" to monitor overall server memory pressure.',
  });

  infraItems.push({
    title: 'QUALITY — /errors: auto-suggest /boot if critical crons are missing from PM2',
    block: 'QUALITY',
    rationale: '/errors shows error logs but not missing processes. When telegram-bot or other critical processes are not in PM2, suggest /boot to re-register.',
  });

  infraItems.push({
    title: 'OPS — /daily-digest: show Phase 1.5 gate bar chart (posts + views %)',
    block: 'OPS',
    rationale: 'Daily digest reports gate stats as numbers. Show a visual progress bar for both posts and views to make progress visceral.',
  });

  infraItems.push({
    title: 'GATE — /today: show how many videos in queue are ready vs captioned',
    block: 'GATE',
    rationale: '/today shows top videos but not queue health. Add "Queue: N ready, M need captions, K need pipeline" to show what operator needs to unblock.',
  });

  infraItems.push({
    title: 'OPS — /blockers: auto-scan for blockers from errors + watchdog + smoke + gate',
    block: 'OPS',
    rationale: '/blockers requires manual entry. Auto-scan error logs, watchdog alerts, smoke failures, and gate progress to generate a live blockers list automatically.',
  });

  // Wave 17 — UX polish + gate + Godman final prep
  infraItems.push({
    title: 'OPS — /status: show active sprint number from sprint-queue.json',
    block: 'OPS',
    rationale: '/status shows gate and queue but not which sprint is active. Pull the latest sprint number from sprint-queue.json and show it in the header.',
  });
  infraItems.push({
    title: 'GATE — /gate: show cumulative posts-per-weekday bar (Mon-Sun)',
    block: 'GATE',
    rationale: 'Gate tracker shows total posts but not posting cadence by day of week. Show a mini bar per weekday so operator can see which days they under-post.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show re-engagement success rate (sent vs replied)',
    block: 'ACHIRI',
    rationale: 'reengage-log.jsonl tracks sent re-engagements but not replies. Cross-reference with daily-counts to compute reply rate and show in /achiri.',
  });
  infraItems.push({
    title: 'OPS — /health: show uptime of telegram-bot process',
    block: 'OPS',
    rationale: '/health shows PM2 memory but not uptime. Show uptime for telegram-bot specifically since it is the primary user-facing process.',
  });
  infraItems.push({
    title: 'GATE — /pace: show estimated gate completion date at current pace',
    block: 'GATE',
    rationale: '/pace shows daily obligation but not ETA. Show \"At this pace, gate completes: 2026-03-XX\" so operator can see if they are on schedule.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: add check that morning-brief PM2 cron exists',
    block: 'QUALITY',
    rationale: 'Smoke test checks bot and pipeline but not the morning-brief cron. Add it as a check since it is critical for daily operator flow.',
  });
  infraItems.push({
    title: 'OPS — /errors: show number of unique processes with errors today',
    block: 'OPS',
    rationale: '/errors shows total error count but the unique process count tells you blast radius. Add \"X processes affected\" to the header line.',
  });
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show npm publish dry-run output for one protocol',
    block: 'GODMAN-LAUNCH',
    rationale: '/godman shows version status but not whether publish would succeed. Run npm publish --dry-run for the first publishable protocol and show truncated output.',
  });
  infraItems.push({
    title: 'OPS — /report: show days since last git commit',
    block: 'OPS',
    rationale: '/report shows sprint and gate but not commit cadence. Show \"Last commit: Xh ago\" as a dev-health signal.',
  });
  infraItems.push({
    title: 'GATE — /today: show next posting slot (morning/noon/evening) countdown',
    block: 'GATE',
    rationale: '/today shows what to post but not when. Show \"Next slot: 7pm in 2h 15m\" based on current time to nudge the operator to post.',
  });

  // Wave 18 — Godman final + Achiri launch + operator quality-of-life
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show git tag status for each protocol (tagged vs untagged)',
    block: 'GODMAN-LAUNCH',
    rationale: '/godman shows version numbers but not whether each protocol has a git tag. Show tagged/untagged status so operator can see what still needs tagging before launch.',
  });
  infraItems.push({
    title: 'OPS — /status: show whether .env file was modified today',
    block: 'OPS',
    rationale: '.env changes often go untracked and can break the pipeline silently. Show "env modified Xh ago" if .env mtime is recent as a change-alert.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show total messages sent via re-engagement (vs organic)',
    block: 'ACHIRI',
    rationale: 'Achiri sends re-engagement messages but we do not track what fraction of daily messages are operator-triggered vs organic. Show breakdown to gauge true DAU health.',
  });
  infraItems.push({
    title: 'GATE — /gate: show average views per post (all-time)',
    block: 'GATE',
    rationale: '/gate shows total views but not per-post average. "Avg views/post: 18" tells operator if quality or quantity is the bottleneck to hitting 500 views.',
  });
  infraItems.push({
    title: 'OPS — /health: show count of PM2 processes with 0 restarts (stability score)',
    block: 'OPS',
    rationale: 'High-restart processes are flagged but stable processes go unnoticed. Show "X/N processes: 0 restarts" as a stability score to celebrate when things are running clean.',
  });
  infraItems.push({
    title: 'QUALITY — /bottest: add test for /pace command output completeness',
    block: 'QUALITY',
    rationale: '/bottest covers /record and command smoke but not /pace. Add a test that checks /pace returns the time-boxed slots and ETA line.',
  });
  infraItems.push({
    title: 'OPS — /errors: show which error log files were created today vs older',
    block: 'OPS',
    rationale: '/errors shows stale vs active logs but not creation date. Show "new today" badge on error logs that appeared since midnight.',
  });
  infraItems.push({
    title: 'GATE — /today: show if any video in queue has been sitting unposted for >48h',
    block: 'GATE',
    rationale: 'Unposted videos that are >48h old may be stale (trending topics expire). Warn operator if top ready video is older than 2 days.',
  });
  infraItems.push({
    title: 'OPS — /weekly-report: show number of sprints shipped this week',
    block: 'OPS',
    rationale: '/weekly-report shows content and Achiri stats but not dev velocity. Add sprint count from git log for the past 7 days to show development cadence.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show current server time and timezone for operator awareness',
    block: 'ACHIRI',
    rationale: 'Operator is in Tunisia (UTC+1) but server runs UTC. Show server time so operator can calibrate re-engagement timing.',
  });

  // Wave 19 — Achiri launch + gate closure + Godman post-launch
  infraItems.push({
    title: 'ACHIRI — /achiri: show how many waitlist users have never messaged (cold leads)',
    block: 'ACHIRI',
    rationale: 'Waitlist may have users who signed up but never sent a message. Cross-reference waitlist.jsonl with daily-counts to find cold leads for targeted re-engagement.',
  });
  infraItems.push({
    title: 'GATE — /gate: show time to deadline as progress ring (days remaining / 14)',
    block: 'GATE',
    rationale: '/gate shows days left numerically but a visual bar would be more alarming near deadline. Show "📅 Deadline: [████░░░░░░] 8/14d" for urgency.',
  });
  infraItems.push({
    title: 'OPS — /status: show daily obligation met/unmet with streak count',
    block: 'OPS',
    rationale: '/status shows today\'s posts but not the obligation streak. Show "🔥 Obligation streak: 3 days met" to reinforce consistent posting behavior.',
  });
  infraItems.push({
    title: 'GODMAN-LAUNCH — /godman: show semver bump type needed (patch/minor/major)',
    block: 'GODMAN-LAUNCH',
    rationale: 'After launch, protocols will need updates. Show what semver bump each protocol needs based on its CHANGELOG.md entries (feat=minor, fix=patch).',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show total smoke test pass rate over last 7 runs',
    block: 'QUALITY',
    rationale: 'Single smoke result shows current state but not stability. Show "7-run pass rate: 85%" using smoke result history to flag flaky infrastructure.',
  });
  infraItems.push({
    title: 'OPS — /health: show whether ANTHROPIC_API_KEY is set and truncated preview',
    block: 'OPS',
    rationale: '/health checks infra but not API credentials. Show ANTHROPIC_API_KEY presence and first/last 4 chars as a quick credential sanity check.',
  });
  infraItems.push({
    title: 'GATE — /pace: show number of posting days remaining until gate (weekdays only)',
    block: 'GATE',
    rationale: '/pace shows calendar days but posting is more realistic on weekdays. Show "posting days left: 8 (weekdays)" to help operator plan realistically.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show last message received from any user (recency signal)',
    block: 'ACHIRI',
    rationale: 'last-active shows the most recent active day but not the actual message timestamp. Show "Last user message: 3h ago" from daily-counts for real-time sense of engagement.',
  });
  infraItems.push({
    title: 'OPS — /errors: show most common error message (top recurring string)',
    block: 'OPS',
    rationale: '/errors shows top process by count but not the top recurring error message across all processes. Show "Most common: ECONNREFUSED ×47" to target root-cause fixes.',
  });
  infraItems.push({
    title: 'OPS — /report: show how many total commits in the repo (all-time)',
    block: 'OPS',
    rationale: 'git log can show total commit count as a project maturity signal. Show "Total commits: 1,247" in /report for operator context.',
  });

  // Wave 20 templates
  infraItems.push({
    title: 'OPS — /health: show disk I/O wait % from iostat (Mac)',
    block: 'OPS',
    rationale: 'Disk saturation can cause pipeline slowdowns silently. Show disk I/O wait % from iostat so operator can detect vault bottlenecks early.',
  });
  infraItems.push({
    title: 'GATE — /gate: show posts-per-week target to hit gate on time',
    block: 'GATE',
    rationale: '/gate shows daily pace but weekly targets are easier to plan around. Show "Need X posts this week to stay on track" based on gate date and posts remaining.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show % of users who sent more than 5 messages (engaged cohort)',
    block: 'ACHIRI',
    rationale: 'Total users undercount engagement depth. Show "X% power users (5+ messages)" as a retention signal to gauge how sticky Achiri is.',
  });
  infraItems.push({
    title: 'OPS — /status: show how many PM2 crons fired today (from logs)',
    block: 'OPS',
    rationale: '/status shows process state but not cron execution count. Show "crons fired today: 12" from PM2 restart logs to confirm automation is running.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show which smoke check took longest (slowest step)',
    block: 'QUALITY',
    rationale: 'Smoke runs can silently bloat if one check hangs. Show "slowest check: TTS (42s)" to identify performance regressions before they become timeouts.',
  });
  infraItems.push({
    title: 'GATE — /pace: show how many videos are queued relative to obligation',
    block: 'GATE',
    rationale: '/pace shows posting pace but not if the queue can sustain it. Show "queue: 8 videos (4d buffer)" so operator knows when to trigger a pipeline run.',
  });
  infraItems.push({
    title: 'OPS — /errors: show if any error log exceeds 1MB (disk health signal)',
    block: 'OPS',
    rationale: 'Large error logs indicate a runaway process. Show "⚠️ telegram-bot-error.log: 3.2MB" as a disk + stability warning.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show which hour of day has most user messages (peak hour)',
    block: 'ACHIRI',
    rationale: 'Knowing peak engagement hour helps schedule re-engagement blasts. Show "Peak hour: 9pm (32 msgs)" from daily-counts for optimal timing.',
  });
  infraItems.push({
    title: 'OPS — /report: show number of validation errors in last pipeline run',
    block: 'OPS',
    rationale: '/report shows gate and sprint but not pipeline quality. Show "Last run: 3 validation errors" from reports/pipeline-runs/latest.json as a quality signal.',
  });
  infraItems.push({
    title: 'GATE — /gate: show TikTok account age in days (warmup maturity)',
    block: 'GATE',
    rationale: 'TikTok warmup quality depends on account age. Show "Account age: 12 days" from warmup-status.json so operator knows when trust builds.',
  });

  // Wave 21 templates
  infraItems.push({
    title: 'GATE — /gate: show if today is a weekend day (no-post warning)',
    block: 'GATE',
    rationale: 'Posting on weekends may have lower engagement. Show a nudge "Today is Saturday — consider weekday scheduling" to help operator maximize reach.',
  });
  infraItems.push({
    title: 'OPS — /health: show how long since last successful Supabase sync',
    block: 'OPS',
    rationale: 'Supabase connectivity check passes but last sync time could be stale. Show "Last Supabase write: 2h ago" from event-bus log to detect silent write failures.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show how many users are on alpha whitelist vs waitlist',
    block: 'ACHIRI',
    rationale: '/achiri shows waitlist count but not whitelist vs waitlist ratio. Show "Whitelist: 8 / Waitlist: 23 (35% approved)" as alpha launch readiness signal.',
  });
  infraItems.push({
    title: 'OPS — /errors: show if any process has restarted more than 5 times today',
    block: 'OPS',
    rationale: 'Restart counts in /health are cumulative. Show "telegram-bot: 7 restarts today" using PM2 pm_uptime delta to catch today-specific instability.',
  });
  infraItems.push({
    title: 'GATE — /pace: show cumulative views trend (are views accelerating?)',
    block: 'GATE',
    rationale: '/pace shows total views but not if they are accelerating. Show "Views last 7d: +120 vs prior 7d: +45" as a virality signal.',
  });
  infraItems.push({
    title: 'OPS — /status: show which video hook type has best avg views',
    block: 'OPS',
    rationale: 'Different hook formulas yield different engagement. Show "Best hook: controversy — avg 42 views" from manual-posts.jsonl + experiments.jsonl.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show total elapsed time for full smoke run',
    block: 'QUALITY',
    rationale: 'Smoke run duration creep can block other CI tasks. Show "Total runtime: 45s" so operator can track if smoke is getting slower over time.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show response latency avg (ms) from last 10 interactions',
    block: 'ACHIRI',
    rationale: 'Bot response time affects user experience. Show "Avg response: 320ms" from achiri interaction logs to detect slowdowns before users notice.',
  });
  infraItems.push({
    title: 'OPS — /report: show if any PM2 process has been offline for >1h',
    block: 'OPS',
    rationale: '/report shows current PM2 state but not sustained outages. Show "telegram-bot: offline 3h" if any critical process has been down for an extended period.',
  });
  infraItems.push({
    title: 'GATE — /gate: show time since last views update (stale data warning)',
    block: 'GATE',
    rationale: '/gate shows total views but they may be stale. Show "Views last updated: 6h ago" from manual-posts.jsonl latest entry to prompt operator to refresh stats.',
  });

  // Wave 22 templates
  infraItems.push({
    title: 'OPS — /status: show video queue viral score distribution (high/med/low)',
    block: 'OPS',
    rationale: '/status shows queue count but not quality breakdown. Show "Queue: 12 ready — H:4 M:6 L:2" to help operator pick the best video to post next.',
  });
  infraItems.push({
    title: 'OPS — /health: show whether morning-brief cron fired today',
    block: 'OPS',
    rationale: '/health shows cron processes but not if today\'s morning-brief actually sent. Read morning-brief log mtime and show "Brief: sent 7:05am" or "Brief: not sent today ⚠️".',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show bounce rate (users who sent only 1 message)',
    block: 'ACHIRI',
    rationale: 'Single-message users represent failed onboarding. Show "Bounce: X users (Y%) sent only 1 msg" to track onboarding effectiveness before alpha.',
  });
  infraItems.push({
    title: 'OPS — /errors: show error count delta since last /errors call',
    block: 'OPS',
    rationale: '/errors shows current count but not if errors are new since last check. Save last-seen count to a state file and show "+N new errors since Xh ago" for active monitoring.',
  });
  infraItems.push({
    title: 'GATE — /pace: show gate pass probability % at current pace',
    block: 'GATE',
    rationale: '/pace shows ETA but not confidence. Compute simple probability: if posts/day >= needed/day for remaining days, show "Gate probability: 94%" to give operator a forecast.',
  });
  infraItems.push({
    title: 'GATE — /gate: show if current week is on track (posts this week vs weekly target)',
    block: 'GATE',
    rationale: '/gate shows total progress but not weekly tracking. Show "Week: 4/7 posts (on track ✅)" or "Week: 1/7 posts (behind ❌)" for rhythm feedback.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: add TikTok token validity check (ping getCreatorInfo)',
    block: 'QUALITY',
    rationale: 'TikTok token expiry is the top posting blocker. Add a smoke check that calls the TikTok API and reports "TikTok token: valid / expired / missing" to catch it early.',
  });
  infraItems.push({
    title: 'OPS — /report: show last 3 sprint titles shipped (dev cadence)',
    block: 'OPS',
    rationale: '/report shows sprint number but not recent sprint titles. Pull last 3 sprint commit messages and list them to show recent dev activity at a glance.',
  });
  infraItems.push({
    title: 'OPS — /status: show Achiri readiness score from achiri-readiness.json',
    block: 'OPS',
    rationale: '/status shows Achiri alpha countdown but not the readiness score. Read reports/achiri-readiness.json and show "Achiri: 94% ready (Nd to alpha)" in the status block.',
  });
  infraItems.push({
    title: 'OPS — /health: show whether kognai-daily-digest cron ran today',
    block: 'OPS',
    rationale: 'Daily digest is a critical monitoring cron. /health shows process status but not last execution. Add "Digest: ran 07:00 today ✅" or "Digest: not run today ⚠️" from logs.',
  });

  // Wave 23 templates
  infraItems.push({
    title: 'OPS — /status: show views-per-post trend (last 5 vs prior 5 posts)',
    block: 'OPS',
    rationale: '/status shows total views but not if engagement per post is improving. Show "Avg views/post: last 5 = 32 vs prior 5 = 18 (📈)" to track quality progression.',
  });
  infraItems.push({
    title: 'OPS — /health: show if any PM2 cron has not fired in over 2 days',
    block: 'OPS',
    rationale: '/health now shows morning-brief but not all crons. Scan all PM2 cron log mtimes and flag any that are >48h stale as potential silent failures.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show messages per active user (depth of engagement)',
    block: 'ACHIRI',
    rationale: 'Bounce rate shows 1-message users; depth shows the other end. Show "Active users avg: 7.2 msgs/user" to gauge conversation quality.',
  });
  infraItems.push({
    title: 'OPS — /errors: show if error rate is accelerating (hourly rate > daily avg)',
    block: 'OPS',
    rationale: 'A burst of errors in the last hour may not show as a trend in daily data. Compare last-hour error rate to daily average to catch emerging incidents early.',
  });
  infraItems.push({
    title: 'GATE — /pace: show how many posts are needed this week specifically',
    block: 'GATE',
    rationale: '/pace shows daily obligation but operators think in weekly batches. Show "This week: need X more posts (Y posted so far this week)" for concrete planning.',
  });
  infraItems.push({
    title: 'GATE — /gate: show top performing post (highest views) as proof of quality',
    block: 'GATE',
    rationale: 'Gate shows totals but not proof of quality. Show "🏆 Best post: <id> with N views" to encourage high-effort content and show what works.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show env var completeness score (N/M required vars set)',
    block: 'QUALITY',
    rationale: 'Smoke checks pipeline but not env var completeness. Add a check that counts how many required env vars are set vs total and shows as "Env: 8/10 required".',
  });
  infraItems.push({
    title: 'OPS — /report: show Achiri alpha readiness alongside gate in system report',
    block: 'OPS',
    rationale: '/report shows gate and sprint but Achiri readiness is separate. Add a one-line Achiri status to /report so operator gets full launch picture in one view.',
  });
  infraItems.push({
    title: 'OPS — /status: show whether sprint queue is empty (needs replenishment)',
    block: 'OPS',
    rationale: '/status shows active sprint number but not if the queue is empty. Show "Queue: 0 pending — run /replenish" warning when no more sprints are queued.',
  });
  infraItems.push({
    title: 'OPS — /health: show SUPABASE_URL domain (sanity check not using wrong DB)',
    block: 'OPS',
    rationale: 'Supabase connects but operator may not see which project is connected. Show "Supabase: <domain>" truncated so operator can confirm it is the right project.',
  });

  // Wave 24 templates
  infraItems.push({
    title: 'OPS — /status: show whether today is a posting obligation day (gate pace)',
    block: 'OPS',
    rationale: '/status shows queue and sprint but not a clear daily posting obligation. Show "Today: post X videos" based on gate pace so operator knows the daily target at a glance.',
  });
  infraItems.push({
    title: 'OPS — /health: show Anthropic API token budget used today (API calls estimate)',
    block: 'OPS',
    rationale: 'Anthropic API costs real money. Show today\'s estimated token spend based on recent API call logs or usage file so operator can spot runaway agents early.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show avg time between first and second message (stickiness)',
    block: 'ACHIRI',
    rationale: 'Bounce rate tells us who left after 1 message; stickiness tells us how quickly users come back. Short return window = strong hook. Compute from daily-counts timestamps.',
  });
  infraItems.push({
    title: 'OPS — /errors: show which error log files were cleared/rotated today',
    block: 'OPS',
    rationale: 'Operators sometimes rotate logs manually. Show if any error log file is newer than its previous snapshot, indicating a rotation that may have cleared errors from view.',
  });
  infraItems.push({
    title: 'GATE — /pace: show % of gate views target met per post (efficiency metric)',
    block: 'GATE',
    rationale: 'Not all posts contribute equally to the 500-view gate target. Show views earned per post as a % of target so operator sees which posts are carrying the weight.',
  });
  infraItems.push({
    title: 'GATE — /gate: show days since last post was recorded (posting cadence gap)',
    block: 'GATE',
    rationale: '/gate shows total posts and views but not recency. Show "Last post: Xh ago" as a cadence gap signal — operator should see if posting has gone cold.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show last pipeline run timestamp and status inline',
    block: 'QUALITY',
    rationale: '/smoke runs a live test but the last pipeline run result (from pipeline-runs/latest.json) is only in /report. Show last pipeline run timestamp + pass/fail inline in /smoke for instant context.',
  });
  infraItems.push({
    title: 'OPS — /report: show daily brief freshness (age of daily-brief.md)',
    block: 'OPS',
    rationale: 'daily-brief.md is auto-generated daily. If it\'s stale (>25h old), the operator may be running on outdated context. Show age of daily-brief.md in /report as a freshness check.',
  });
  infraItems.push({
    title: 'OPS — /status: show TikTok account warmup score from warmup-status.json',
    block: 'OPS',
    rationale: '/status shows queue and sprint but not TikTok account trust level. Show warmup score/days so operator can quickly see if the account is in good standing for posting.',
  });
  infraItems.push({
    title: 'OPS — /health: show whether validate-full-pipeline cron ran in last 24h',
    block: 'OPS',
    rationale: 'validate-full-pipeline is the core quality gate. If it hasn\'t run in >24h, content quality is unverified. Check the pipeline-runs/latest.json timestamp and warn if stale.',
  });

  // Wave 25 templates
  infraItems.push({
    title: 'OPS — /status: show last 3 error log filenames that spiked today',
    block: 'OPS',
    rationale: '/status is the operator\'s first stop. Show which error logs spiked today (by file mtime and line count) so operator can spot active issues without opening /errors.',
  });
  infraItems.push({
    title: 'OPS — /health: show git worktree count (detect accidental open worktrees)',
    block: 'OPS',
    rationale: 'Developers sometimes forget open git worktrees that consume disk. Show count of active worktrees from "git worktree list" to catch leaks early.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show % of users who reached message limit (monetization signal)',
    block: 'ACHIRI',
    rationale: 'Users hitting the free-tier message limit are the highest-intent upgrade candidates. Show what % of active users hit the limit today/total as a paywall pressure metric.',
  });
  infraItems.push({
    title: 'OPS — /errors: show top 3 error lines by occurrence count (most spammy errors)',
    block: 'OPS',
    rationale: '/errors already shows unique errors, but the most-repeated lines (e.g. polling errors) may dominate without being actionable. Show top 3 by count separately.',
  });
  infraItems.push({
    title: 'GATE — /pace: show break-even post count (posts needed to cover API costs)',
    block: 'GATE',
    rationale: 'Each video generation has an API cost. Show how many posts are needed to cover the cost of the pipeline run (break-even) so operator sees the ROI threshold.',
  });
  infraItems.push({
    title: 'GATE — /gate: show latest E2E test result from achiri-e2e-latest.json',
    block: 'GATE',
    rationale: '/gate shows content pipeline but not Achiri E2E health. Add the latest E2E test pass/fail status so operator gets a one-stop Phase 2 launch readiness view.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show number of captioned MP4s ready for posting',
    block: 'QUALITY',
    rationale: '/smoke validates the pipeline but doesn\'t show how many finished, caption-ready videos exist. Add a count of captioned MP4s so operator sees the posting buffer.',
  });
  infraItems.push({
    title: 'OPS — /report: show PM2 total restart count delta since last /report call',
    block: 'OPS',
    rationale: 'Total restarts creep up silently. Show restart delta since last /report to surface restart storms that don\'t show as "errors" but indicate instability.',
  });
  infraItems.push({
    title: 'OPS — /status: show if Godman Protocols npm packages are published',
    block: 'OPS',
    rationale: '/status shows Godman days to launch but not package publish status. Show which Godman npm packages have been published so operator knows real launch readiness.',
  });
  infraItems.push({
    title: 'OPS — /health: show Node.js memory usage (RSS + heap) of telegram-bot process',
    block: 'OPS',
    rationale: 'telegram-bot is the operator\'s primary interface. Show its RSS and heap usage so operator can detect memory leaks before they cause crashes.',
  });

  // Wave 26 templates
  infraItems.push({
    title: 'OPS — /status: show pending Achiri waitlist request count',
    block: 'OPS',
    rationale: 'Waitlist signups are a lead metric for Achiri alpha. Show count of users on waitlist not yet whitelisted so operator knows demand backlog at a glance in /status.',
  });
  infraItems.push({
    title: 'OPS — /health: show how many days until the Phase 1.5 gate deadline',
    block: 'OPS',
    rationale: '/health shows infrastructure state but not deadline pressure. Add a prominent "Gate in Xd" line to /health so operators always know the deadline without opening /gate.',
  });
  infraItems.push({
    title: 'ACHIRI — /achiri: show Derja profiler test pass rate from latest run',
    block: 'ACHIRI',
    rationale: 'Derja profiling is core to Achiri personality. Show the latest test pass rate (from validate-derja-profiler.ts output or saved report) in /achiri for quick validation.',
  });
  infraItems.push({
    title: 'OPS — /errors: show processes with zero errors today (all-clear list)',
    block: 'OPS',
    rationale: 'Operators focus on errors but a zero-error list builds confidence. Show processes that have been clean all day to offset the error noise and signal overall stability.',
  });
  infraItems.push({
    title: 'GATE — /pace: show time since last pipeline run (content freshness)',
    block: 'GATE',
    rationale: '/pace focuses on posting pace but content freshness also matters. Show how long since the last pipeline run produced new videos so operator knows if the supply is stale.',
  });
  infraItems.push({
    title: 'GATE — /gate: show subscriber count required to hit MRR target',
    block: 'GATE',
    rationale: '/gate tracks posts and views but not the revenue path. Show how many €9/mo subscribers are needed to hit the MRR target (e.g. €500) to tie content KPIs to revenue.',
  });
  infraItems.push({
    title: 'QUALITY — /smoke: show total runtime vs previous run (performance trend)',
    block: 'QUALITY',
    rationale: 'If smoke test runtime grows, it may indicate pipeline bloat. Show current run duration vs the previous saved run to detect performance regressions early.',
  });
  infraItems.push({
    title: 'OPS — /report: show Godman npm publish status for each package',
    block: 'OPS',
    rationale: '/report shows launch countdown but not per-package publish status. Add a line listing which Godman packages are published and which are still local-only.',
  });
  infraItems.push({
    title: 'OPS — /status: show count of unread Telegram bot messages (backlog)',
    block: 'OPS',
    rationale: 'If the bot has a pending message backlog (from users waiting for replies), operator needs to know. Show unread/queued message count from the Achiri bot log.',
  });
  infraItems.push({
    title: 'OPS — /health: show last backup timestamp from backup log if available',
    block: 'OPS',
    rationale: 'Data backups are easy to forget. Show timestamp of last successful backup from any backup script log or backup-status.json if present, or warn if none found.',
  });

  // Wave 14 templates — AMD-23/AMD-25 integration + Godman post-launch + phase 2 hardening
  // Added Sprint 1273 after all prior templates exhausted (342 done, 50 skipped)
  infraItems.push({
    title: 'AMD23 — Cerberus gateway integration test: end-to-end agent eval via HTTP',
    block: 'AMD23',
    rationale: 'Cerberus gateway runs on port 3419. Write a test script that sends a full evaluate request and confirms the signed GatewayDecision is returned with valid HMAC.',
  });

  infraItems.push({
    title: 'AMD25 — DKA LRU cache: evict least-recently-used entries when store exceeds 1000 docs',
    block: 'AMD25',
    rationale: 'DKA store is in-memory with JSONL persistence. Add LRU eviction so store does not grow unbounded. Cap at 1000 documents and emit eviction events to metrics.',
  });

  infraItems.push({
    title: 'AMD25 — DKA curator SOUL filter: reject non-public vectors for PROVISIONAL-tier agents',
    block: 'AMD25',
    rationale: 'curator.ts has boundary rules but SOUL attestation tier check is incomplete. Add explicit PROVISIONAL tier check that blocks access to confidential domain vectors.',
  });

  infraItems.push({
    title: 'GODMAN-POST-LAUNCH — /godman: show live npm version badge per protocol after publish',
    block: 'GODMAN-PROTOCOLS',
    rationale: `After Apr 14 npm publish, /godman should query the npm registry (registry.npmjs.org/-/package/<pkg>/dist-tags) and show the published version for each of the 8 packages.`,
  });

  infraItems.push({
    title: 'GODMAN-POST-LAUNCH — Godman DeerFlow deployment: push SKILL.md to deerflow-skills repo',
    block: 'GODMAN-PROTOCOLS',
    rationale: 'SKILL.md is authored and verified. Post-launch, submit a PR to the deerflow-skills registry with the Godman Pact + SOUL skill definitions to expand agent discovery.',
  });

  infraItems.push({
    title: 'OPS — /sprint-log: show last 10 sprint commits with titles from git log',
    block: 'OPS',
    rationale: 'Operator has no quick way to see what was shipped recently without running git log. /sprint-log parses git log --oneline -10 and formats sprint IDs + titles for Telegram.',
  });

  infraItems.push({
    title: 'PHASE2 — Achiri Hetzner deploy: pm2 start achiri-telegram + health check script',
    block: 'PHASE2',
    rationale: 'Once ACHIRI_TELEGRAM_BOT_TOKEN is set, a single script should start the bot on Hetzner. Add scripts/achiri/deploy-hetzner.sh with pm2 start + curl health check.',
  });

  infraItems.push({
    title: 'INFRA — YouTube Shorts auto-upload: wire yt-dlp + YouTube Data API v3 upload',
    block: 'INFRA',
    rationale: 'YouTube credentials are configured. Add scripts/scs001/youtube-upload.ts that takes a video path, uploads as a Short (aspect ratio check + title from caption), and logs the video ID.',
  });

  infraItems.push({
    title: 'QUALITY — /errors: deduplicate repeated error lines and show count',
    block: 'QUALITY',
    rationale: '/errors can show the same error repeated many times if a cron looped. Add dedup: show "Error message (×N times)" instead of N identical lines. Cap output at 8 unique errors.',
  });

  infraItems.push({
    title: 'OPS — Daily brief generator: replace static KOGNAI_DAILY_TIMELINE.md tasks with live gate state',
    block: 'OPS',
    rationale: 'generate-daily-brief.py sources TODAY tasks from KOGNAI_DAILY_TIMELINE.md which is static. Replace with dynamic generator that reads gate state, open blockers, and launch countdowns.',
  });

  infraItems.push({
    title: 'GATE — TikTok OAuth token refresh: add /refresh-token Telegram command',
    block: 'GATE',
    rationale: 'TIKTOK_ACCESS_TOKEN expires and blocks auto-posting. Add /refresh-token command that triggers the OAuth refresh flow and shows new token expiry time to operator.',
  });

  infraItems.push({
    title: 'AMD23 — Cerberus PM2 smoke: add cerberus-gateway to /smoke test suite',
    block: 'AMD23',
    rationale: 'Cerberus gateway is in PM2 ecosystem but not in smoke tests. Add a check to reports/smoke-test-latest.json that verifies cerberus-gateway is online and /health returns 200.',
  });

  infraItems.push({
    title: 'GODMAN-LAUNCH — publish-all.sh: serial npm publish for 8 packages in dependency order',
    block: 'GODMAN-PROTOCOLS',
    rationale: `Apr 14 launch: need a single script to publish all 8 Godman packages in order (pact, lax, score, amf, drs, soul, signal, sdk). Add --provenance flag and dry-run mode.`,
  });

  infraItems.push({
    title: 'PHASE2 — Achiri SIWA upgrade: wire Supabase auth provider for PROVISIONAL→STANDARD tier',
    block: 'PHASE2',
    rationale: 'AMD-23 Chamber 4 caps PROVISIONAL agents to RESTRICTED. Achiri users who complete SIWA (Sign In With Apple) should upgrade to STANDARD tier. Wire the Supabase auth event to the tier upgrade.',
  });

  infraItems.push({
    title: 'INFRA — /health: add Tailscale VPN status check (online/offline)',
    block: 'INFRA',
    rationale: 'If Tailscale drops, Mac Mini vault is unreachable and local model inference silently fails. Add a tailscale status ping to /health output so operator catches VPN issues early.',
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

// Sprint 1248: archive pending queue items older than STALE_DAYS (content freshness decay)
const STALE_DAYS = 7;

function archiveStaleItems(queue: QueueItem[], dryRun: boolean): number {
  const now = Date.now();
  const cutoff = STALE_DAYS * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const item of queue) {
    if (['done', 'skipped', 'skip'].includes(item.status)) continue;
    if (!item.added_at) continue;
    const age = now - new Date(item.added_at).getTime();
    if (age > cutoff) {
      if (!dryRun) item.status = 'skipped';
      console.log(`[replenish] ${dryRun ? 'WOULD archive' : 'Archived'} stale item (${Math.floor(age / 86400000)}d old): ${item.title.slice(0, 60)}`);
      count++;
    }
  }
  return count;
}

function main(): void {
  const DRY_RUN = process.env.REPLENISH_DRY_RUN === '1';
  const queuePath = path.join(ROOT, 'workspace', 'sprint-queue.json');

  const existing = readJSON<QueueFile>(queuePath);
  if (!existing) {
    console.error('[replenish] Could not read sprint-queue.json');
    process.exit(1);
  }

  // Sprint 1248: archive stale pending items before checking queue fullness
  const archivedCount = archiveStaleItems(existing.queue, DRY_RUN);
  if (archivedCount > 0 && !DRY_RUN) {
    existing.updated = new Date().toISOString().slice(0, 16);
    fs.writeFileSync(queuePath, JSON.stringify(existing, null, 2));
    console.log(`[replenish] Archived ${archivedCount} stale item(s).`);
  }

  // Check if there are pending items
  const pending = existing.queue.filter(i => !['done', 'skipped', 'skip'].includes(i.status));
  if (pending.length > 0) {
    console.log(`[replenish] Queue has ${pending.length} pending items. No replenishment needed.`);
    return;
  }

  const lastSprint = getLastSprintNumber();
  const startSprint = lastSprint + 2; // +2 because current sprint is lastSprint+1
  // Sprint 1245: only dedup against pending items (not done/skipped) for prefix match to avoid false positives
  // Sprint 1248: also pass all titles (incl. done/skipped) for exact-match dedup to prevent regenerating completed work
  // Sprint 1273: exclude 'skipped'/'skip' from allExistingTitles — skipped items were deprioritised not shipped,
  //              so they can be regenerated when the queue is empty again.
  const DONE_STATUSES = new Set(['done', 'skipped', 'skip']);
  const existingTitles = new Set(existing.queue.filter(i => !DONE_STATUSES.has(i.status)).map(i => i.title));
  const allExistingTitles = new Set(existing.queue.filter(i => i.status === 'done').map(i => i.title));
  const newItems = generateItems(startSprint, existingTitles, allExistingTitles);

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

  // Append new items to queue (Sprint 1248: stamp added_at for freshness decay)
  const now = new Date().toISOString();
  for (const item of newItems) { item.added_at = now; }
  existing.queue.push(...newItems);
  existing.updated = new Date().toISOString().slice(0, 16);
  existing._plan_rationale = `Auto-replenished ${new Date().toISOString().slice(0, 10)}: ${newItems.length} items generated by replenish-sprint-queue.ts. Based on watchdog alerts, gate state (${getGateState().postsDelivered}/30 posts, ${getGateState().daysLeft}d), and infra gaps.`;

  fs.writeFileSync(queuePath, JSON.stringify(existing, null, 2));
  console.log(`[replenish] Wrote ${newItems.length} items to sprint-queue.json`);
}

// Export for Telegram command
export { main as replenishQueue, generateItems, getLastSprintNumber };

main();
