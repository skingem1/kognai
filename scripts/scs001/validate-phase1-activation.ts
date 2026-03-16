// Phase 1 Activation Readiness Checker
// Validates system is correctly configured for live TikTok posting.
// Does NOT make any API calls or post to TikTok.
// Writes workspace/gates/phase1-activation-readiness.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface ReadinessCheck {
  id:               string;
  name:             string;
  pass:             boolean;
  details:          string;
  action_required?: string;
}

interface ReadinessReport {
  sprint:                   string;
  date:                     string;
  phase:                    string;
  checks:                   ReadinessCheck[];
  ready_to_post:            boolean;
  human_actions_required:   string[];
  notes:                    string;
}

async function main(): Promise<void> {
  // Read ecosystem.config.js once — used by checks 1 and 4
  const ecosystemPath = join(process.cwd(), 'ecosystem.config.js');
  let ecosystemContent = '';
  try {
    ecosystemContent = readFileSync(ecosystemPath, 'utf-8');
  } catch (err) {
    ecosystemContent = '';
  }

  // ── CHECK 1 — scs001-live process in ecosystem.config.js ──────────────────
  const hasLiveProcess = ecosystemContent.includes('"scs001-live"') || ecosystemContent.includes("'scs001-live'");
  const check1: ReadinessCheck = {
    id:   'ecosystem-live-process',
    name: 'ecosystem.config.js has scs001-live process',
    pass: hasLiveProcess,
    details: hasLiveProcess
      ? 'scs001-live process found in ecosystem.config.js'
      : 'scs001-live process NOT found in ecosystem.config.js',
    ...(hasLiveProcess ? {} : { action_required: 'Add scs001-live process to ecosystem.config.js' }),
  };

  // ── CHECK 2 — TIKTOK_ACCESS_TOKEN env var ────────────────────────────────
  const token = process.env.TIKTOK_ACCESS_TOKEN || '';
  const check2: ReadinessCheck = {
    id:   'tiktok-token',
    name: 'TIKTOK_ACCESS_TOKEN env var present',
    pass: token.length > 0,
    details: token.length > 0
      ? 'TIKTOK_ACCESS_TOKEN is set (length: ' + token.length + ' chars)'
      : 'TIKTOK_ACCESS_TOKEN is NOT set in environment',
    ...(token.length > 0 ? {} : {
      action_required: 'Set TIKTOK_ACCESS_TOKEN in .env — obtain from TikTok Developer Portal (developers.tiktok.com), video.upload scope required',
    }),
  };

  // ── CHECK 3 — TikTok client config file exists ───────────────────────────
  const configPath = join(process.cwd(), 'agents', 'tiktok-client', 'config.ts');
  const configExists = existsSync(configPath);
  const check3: ReadinessCheck = {
    id:   'tiktok-client-config',
    name: 'TikTok client config exists',
    pass: configExists,
    details: configExists
      ? 'agents/tiktok-client/config.ts exists'
      : 'agents/tiktok-client/config.ts NOT found',
    ...(configExists ? {} : { action_required: 'TikTok client config is missing — check agents/tiktok-client/' }),
  };

  // ── CHECK 4 — scs001-pipeline mock process preserved ─────────────────────
  const hasMockProcess = ecosystemContent.includes('"scs001-pipeline"') || ecosystemContent.includes("'scs001-pipeline'");
  const check4: ReadinessCheck = {
    id:   'mock-fallback',
    name: 'Mock pipeline fallback preserved',
    pass: hasMockProcess,
    details: hasMockProcess
      ? 'scs001-pipeline mock process still present — dry-run fallback intact'
      : 'WARNING: scs001-pipeline mock process was removed — no dry-run fallback',
  };

  // ── BUILD REPORT ──────────────────────────────────────────────────────────
  const checks: ReadinessCheck[] = [check1, check2, check3, check4];
  const criticalChecks = [check1, check2, check3];
  const ready_to_post = criticalChecks.every(c => c.pass);
  const human_actions_required = checks
    .filter(c => c.action_required)
    .map(c => c.action_required as string);

  const notes = ready_to_post
    ? 'System configured for Phase 1 live posting. Run: pm2 start ecosystem.config.js --only scs001-live'
    : 'System NOT ready for live posting. Complete all human actions above before starting scs001-live.';

  const report: ReadinessReport = {
    sprint: '097',
    date: new Date().toISOString().slice(0, 10),
    phase: 'phase-1-activation',
    checks,
    ready_to_post,
    human_actions_required,
    notes,
  };

  // ── WRITE REPORT ──────────────────────────────────────────────────────────
  const gatesDir = join(process.cwd(), 'workspace', 'gates');
  mkdirSync(gatesDir, { recursive: true });
  writeFileSync(join(gatesDir, 'phase1-activation-readiness.json'), JSON.stringify(report, null, 2));

  // ── PRINT RESULTS ─────────────────────────────────────────────────────────
  checks.forEach(c => console.log((c.pass ? '\u2713' : '\u2717') + ' [' + c.name + ']: ' + c.details));

  if (human_actions_required.length > 0) {
    console.log('');
    console.log('HUMAN ACTIONS REQUIRED:');
    human_actions_required.forEach((a, i) => console.log('  ' + (i + 1) + '. ' + a));
  }

  console.log('');
  console.log(ready_to_post ? 'PHASE 1 READY' : 'PHASE 1 BLOCKED — complete actions above');
  console.log('Report written to workspace/gates/phase1-activation-readiness.json');

  process.exit(ready_to_post ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
