#!/usr/bin/env ts-node
// Sprint 169: Update docs/gate-tracker.md with current gate status
// Run daily via PM2 cron (07:08) after kognai-gate-regen.
// Keeps gate-tracker.md accurate so Claude sessions start with correct context.

import * as fs   from 'fs';
import * as path from 'path';

const ROOT          = path.resolve(__dirname, '..');
const GATE_JSON     = path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
const MANUAL_POSTS  = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const GATE_TRACKER  = path.join(ROOT, 'docs', 'gate-tracker.md');

// ── helpers ───────────────────────────────────────────────────────────────────

function readJSON<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function countLines(p: string): number {
  if (!fs.existsSync(p)) return 0;
  return fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim()).length;
}

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000));
}

// ── read current gate state ───────────────────────────────────────────────────

const gateData = readJSON<any>(GATE_JSON);
const postCount = countLines(MANUAL_POSTS);
const totalViews = (() => {
  if (!fs.existsSync(MANUAL_POSTS)) return 0;
  return fs.readFileSync(MANUAL_POSTS, 'utf-8').split('\n')
    .filter(l => l.trim())
    .reduce((sum, l) => {
      try { return sum + (JSON.parse(l).views ?? 0); } catch { return sum; }
    }, 0);
})();

// Phase 0→1: PASSED if pipeline has generated any videos (publish-ledger.jsonl exists)
const ledgerPath    = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const ledgerCount   = countLines(ledgerPath);
const phase01Pass   = ledgerCount > 0;

// Phase 1.5: posts + views vs targets
const phase15Pass   = postCount >= 30 && totalViews >= 500;
const phase15Status = phase15Pass
  ? `[x] PASS`
  : `[ ] Pending`;
const phase15Notes  = `${postCount}/30 posts · ${totalViews}/500 views`;

// Achiri waitlist count
const waitlistPath  = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
const waitlistCount = countLines(waitlistPath);

const daysPhase15   = daysUntil('2026-04-07T00:00:00Z');
const daysGodman    = daysUntil('2026-04-14T00:00:00Z');
const daysPhase2A   = daysUntil('2026-04-11T00:00:00Z');
const daysAchiri    = daysUntil('2026-04-25T00:00:00Z');

// Godman launch readiness: check if all 7 protocol dist/ dirs exist
const GODMAN_PROTOS = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs'];
const godmanReady = GODMAN_PROTOS.every(p =>
  fs.existsSync(path.join(ROOT, 'workspace', 'godman-protocols', p, 'dist'))
);

const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

// ── generate updated gate-tracker.md ─────────────────────────────────────────

const content = `# GATE TRACKER
*Updated: ${now} (auto by scripts/update-gate-tracker.ts)*

# GATE TRACKER
# ═══════════════════════════════════════════════

| Gate | Target Date | Status | Result | Notes |
|---|---|---|---|---|
| Phase 0 → Phase 1 | Mar 13 | ${phase01Pass ? '[x] PASS' : '[ ] Pending'} | ${phase01Pass ? 'PROCEED' : ''} | Pipeline operational · ${ledgerCount} videos generated |
| Phase 1.5 Decision | Apr 7 | ${phase15Status} | ${phase15Pass ? 'PROCEED' : ''} | ${phase15Notes} · ${daysPhase15}d remaining |
| Godman Protocols Launch | Apr 14 | ${godmanReady ? '[x] READY' : '[ ] Pending'} | ${godmanReady ? 'LAUNCH' : ''} | 7/7 protocols ${godmanReady ? 'built' : 'pending'} · ${daysGodman}d remaining |
| Phase 1 → Phase 2A | Apr 11 | [ ] Pending | | ${daysPhase2A}d remaining |
| Achiri Lite Alpha Launch | Apr 25 | [ ] Pending | | Waitlist: ${waitlistCount} · ${daysAchiri}d remaining |
| Lite Alpha Gate (voice works?) | May 1 | [ ] Pending | | |
| Full Alpha Gate (memory works?) | May 14 | [ ] Pending | | |
| Phase 2A → Phase 2B | May 30 | [ ] Pending | | |
| Phase 2B Gate | Jun 27 | [ ] Pending | | |
| Phase 3 Gate | Sep 26 | [ ] Pending | | |
| Year-End Review | Dec 19 | [ ] Pending | | |
`;

fs.writeFileSync(GATE_TRACKER, content, 'utf-8');
console.log(`[update-gate-tracker] gate-tracker.md updated at ${now}`);
console.log(`  Phase 0→1: ${phase01Pass ? 'PASS' : 'PENDING'} (${ledgerCount} videos)`);
console.log(`  Phase 1.5: ${postCount}/30 posts · ${totalViews}/500 views · ${daysPhase15}d left`);
console.log(`  Achiri:    waitlist=${waitlistCount} · ${daysAchiri}d to Apr 25`);
process.exit(0);
