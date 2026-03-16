// validate-production-preflight.ts — Sprint 099
// Checks all prerequisites for live TikTok posting and outputs a human-readable
// checklist with fix hints. Run before attempting live posting.
//
// Usage: npx ts-node scripts/scs001/validate-production-preflight.ts

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface PreflightCheck {
  id:        string;
  name:      string;
  pass:      boolean;
  details:   string;
  required:  boolean;
  fix_hint:  string;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const checks: PreflightCheck[] = [];

  // --- 1. TIKTOK_ACCESS_TOKEN ---
  const tikTokToken = process.env.TIKTOK_ACCESS_TOKEN ?? '';
  checks.push({
    id:       'tiktok-token',
    name:     'TIKTOK_ACCESS_TOKEN',
    pass:     tikTokToken.length > 0,
    details:  tikTokToken.length > 0
      ? 'Set (' + tikTokToken.substring(0, 8) + '...)'
      : 'NOT SET',
    required: true,
    fix_hint: 'Set TIKTOK_ACCESS_TOKEN in .env — obtain from TikTok Developer Portal > Manage Apps > Access Token',
  });

  // --- 2. SUPABASE_URL ---
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  checks.push({
    id:       'supabase-url',
    name:     'SUPABASE_URL',
    pass:     supabaseUrl.length > 0,
    details:  supabaseUrl.length > 0
      ? 'Set (' + supabaseUrl.substring(0, 30) + '...)'
      : 'NOT SET',
    required: true,
    fix_hint: 'Set SUPABASE_URL in .env — from Supabase Dashboard > Settings > API > Project URL',
  });

  // --- 3. SUPABASE_SERVICE_KEY ---
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? '';
  checks.push({
    id:       'supabase-key',
    name:     'SUPABASE_SERVICE_KEY',
    pass:     supabaseKey.length > 0,
    details:  supabaseKey.length > 0
      ? 'Set (' + supabaseKey.substring(0, 8) + '...)'
      : 'NOT SET',
    required: true,
    fix_hint: 'Set SUPABASE_SERVICE_KEY in .env — from Supabase Dashboard > Settings > API > service_role key (NOT anon key)',
  });

  // --- 4. SCS_EDITING_MODE (optional but recommended) ---
  const editingMode = process.env.SCS_EDITING_MODE ?? '';
  checks.push({
    id:       'editing-mode',
    name:     'SCS_EDITING_MODE',
    pass:     editingMode === 'production',
    details:  editingMode || 'NOT SET (default: mock)',
    required: false,
    fix_hint: 'Set SCS_EDITING_MODE=production in .env for drawtext + subtitle burn-in video quality',
  });

  // --- 5. SCS_MODE ---
  const scsMode = process.env.SCS_MODE ?? '';
  checks.push({
    id:       'scs-mode',
    name:     'SCS_MODE',
    pass:     scsMode === 'live',
    details:  scsMode || 'NOT SET (default: mock)',
    required: true,
    fix_hint: 'Set SCS_MODE=live in .env or start with: pm2 start ecosystem.config.js --only scs001-live',
  });

  // --- 6. ecosystem.config.js has scs001-live process ---
  const ecosystemPath = join(root, 'ecosystem.config.js');
  let ecosystemPass = false;
  let ecosystemDetails = '';
  if (!existsSync(ecosystemPath)) {
    ecosystemDetails = 'ecosystem.config.js not found';
  } else {
    const contents = readFileSync(ecosystemPath, 'utf-8');
    ecosystemPass = contents.includes('scs001-live');
    ecosystemDetails = ecosystemPass
      ? 'scs001-live process found in ecosystem.config.js'
      : 'scs001-live process NOT found in ecosystem.config.js';
  }
  checks.push({
    id:       'ecosystem-live',
    name:     'scs001-live PM2 process',
    pass:     ecosystemPass,
    details:  ecosystemDetails,
    required: true,
    fix_hint: 'Run Sprint 097 tasks to add scs001-live process to ecosystem.config.js',
  });

  // --- 7. Video Hosting Service (Supabase Storage) ---
  const hostingConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0;
  checks.push({
    id:       'hosting-service',
    name:     'Video Hosting Service (Supabase Storage)',
    pass:     hostingConfigured,
    details:  hostingConfigured
      ? 'Supabase Storage configured (SUPABASE_URL + SUPABASE_SERVICE_KEY set)'
      : 'NOT CONFIGURED — videos will use local paths (TikTok PULL_FROM_URL will fail)',
    required: true,
    fix_hint: 'Set both SUPABASE_URL and SUPABASE_SERVICE_KEY for Supabase Storage video hosting (Sprint 099)',
  });

  // --- Print results ---
  console.log('\n=== SCS-001 PRODUCTION PREFLIGHT ===\n');
  checks.forEach(c => {
    console.log(
      (c.pass ? '\u2713' : '\u2717') +
      ' [' + (c.required ? 'REQUIRED' : 'OPTIONAL') + '] ' +
      c.name + ': ' + c.details
    );
    if (!c.pass) {
      console.log('  FIX: ' + c.fix_hint);
    }
  });

  const requiredFails = checks.filter(c => c.required && !c.pass);
  const optionalFails = checks.filter(c => !c.required && !c.pass);

  console.log('');
  if (requiredFails.length > 0) {
    console.log('PREFLIGHT BLOCKED — ' + requiredFails.length + ' required check(s) failed.');
    console.log('Fix the REQUIRED items above, then re-run:');
    console.log('  npx ts-node scripts/scs001/validate-production-preflight.ts');
    process.exit(1);
  } else {
    console.log('PREFLIGHT PASS — all ' + checks.filter(c => c.required).length + ' required checks met.');
    if (optionalFails.length > 0) {
      console.log('(' + optionalFails.length + ' optional enhancement(s) available — see OPTIONAL items above)');
    }
    console.log('Ready: pm2 start ecosystem.config.js --only scs001-live');
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
