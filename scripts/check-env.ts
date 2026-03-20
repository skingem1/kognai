#!/usr/bin/env ts-node
/**
 * Environment Variable Validator — Sprint 456
 * Checks all required env vars for each Kognai subsystem.
 * Can be run standalone or imported by Telegram /envcheck command.
 */

import * as fs from 'fs';
import * as path from 'path';

interface EnvCheck {
  name: string;
  required: boolean;
  set: boolean;
  subsystem: string;
}

interface SubsystemStatus {
  name: string;
  checks: EnvCheck[];
  ready: boolean;
  setCount: number;
  totalRequired: number;
}

const SUBSYSTEMS: Record<string, Array<{ name: string; required: boolean }>> = {
  'Telegram Bot': [
    { name: 'CEO_TELEGRAM_BOT_TOKEN', required: true },
    { name: 'OWNER_TELEGRAM_CHAT_ID', required: true },
  ],
  'TikTok API': [
    { name: 'TIKTOK_CLIENT_KEY', required: true },
    { name: 'TIKTOK_CLIENT_SECRET', required: true },
    { name: 'TIKTOK_ACCESS_TOKEN', required: true },
  ],
  'YouTube': [
    { name: 'YOUTUBE_API_KEY', required: true },
    { name: 'YOUTUBE_CLIENT_ID', required: false },
    { name: 'YOUTUBE_CLIENT_SECRET', required: false },
  ],
  'Stripe': [
    { name: 'STRIPE_SECRET_KEY', required: true },
    { name: 'STRIPE_WEBHOOK_SECRET', required: true },
    { name: 'STRIPE_PRICE_GROWTH', required: true },
    { name: 'STRIPE_PRICE_PREMIUM', required: true },
    { name: 'STRIPE_SUCCESS_URL', required: false },
    { name: 'STRIPE_CANCEL_URL', required: false },
  ],
  'Supabase': [
    { name: 'SUPABASE_URL', required: true },
    { name: 'SUPABASE_ANON_KEY', required: true },
    { name: 'SUPABASE_SERVICE_KEY', required: true },
  ],
  'Ollama (Local Models)': [
    { name: 'OLLAMA_HOST', required: true },
    { name: 'VAULT_LOCAL_MODEL_POWER', required: false },
    { name: 'VAULT_LOCAL_MODEL_CTO', required: false },
    { name: 'VAULT_TAILSCALE_IP', required: false },
  ],
  'AI APIs': [
    { name: 'ANTHROPIC_API_KEY', required: true },
    { name: 'OPENAI_API_KEY', required: false },
    { name: 'ELEVENLABS_API_KEY', required: false },
    { name: 'MINIMAX_API_KEY', required: false },
    { name: 'FAL_KEY', required: false },
    { name: 'JSON2VIDEO_API_KEY', required: false },
  ],
  'Media': [
    { name: 'PEXELS_API_KEY', required: false },
    { name: 'PIXABAY_API_KEY', required: false },
  ],
  'Pipeline': [
    { name: 'SCS_EDITING_MODE', required: true },
    { name: 'SCS_CLIPS_DIR', required: false },
  ],
  'Database': [
    { name: 'PGHOST', required: false },
    { name: 'PGDATABASE', required: false },
    { name: 'PGUSER', required: false },
  ],
};

export function checkEnv(): SubsystemStatus[] {
  const results: SubsystemStatus[] = [];

  for (const [subsystem, vars] of Object.entries(SUBSYSTEMS)) {
    const checks: EnvCheck[] = vars.map(v => ({
      name: v.name,
      required: v.required,
      set: !!process.env[v.name],
      subsystem,
    }));

    const requiredChecks = checks.filter(c => c.required);
    const setRequired = requiredChecks.filter(c => c.set).length;

    results.push({
      name: subsystem,
      checks,
      ready: requiredChecks.length === 0 || setRequired === requiredChecks.length,
      setCount: checks.filter(c => c.set).length,
      totalRequired: requiredChecks.length,
    });
  }

  return results;
}

export function formatEnvCheck(): string {
  const results = checkEnv();

  const lines: string[] = ['*🔧 Environment Variable Check*', ''];

  let totalSet = 0;
  let totalRequired = 0;
  let totalVars = 0;
  let readySystems = 0;

  for (const sub of results) {
    const icon = sub.ready ? '✅' : '❌';
    if (sub.ready) readySystems++;
    totalRequired += sub.totalRequired;

    lines.push(`${icon} *${sub.name}*`);

    for (const c of sub.checks) {
      totalVars++;
      if (c.set) totalSet++;
      const setIcon = c.set ? '✅' : (c.required ? '❌' : '⚪');
      const reqLabel = c.required ? '' : ' _(optional)_';
      lines.push(`  ${setIcon} ${c.name}${reqLabel}`);
    }
    lines.push('');
  }

  // Summary
  const requiredSet = results.reduce((s, r) => s + r.checks.filter(c => c.required && c.set).length, 0);
  lines.push(`*Summary:* ${readySystems}/${results.length} subsystems ready`);
  lines.push(`*Required:* ${requiredSet}/${totalRequired} set`);
  lines.push(`*Total:* ${totalSet}/${totalVars} vars configured`);

  // Action items
  const missing = results
    .flatMap(r => r.checks)
    .filter(c => c.required && !c.set);

  if (missing.length > 0) {
    lines.push('');
    lines.push('*🔴 Missing (required):*');
    for (const m of missing) {
      lines.push(`  • ${m.name} _(${m.subsystem})_`);
    }
  }

  return lines.join('\n');
}

// CLI mode
if (require.main === module) {
  // Load .env file if present
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').split('#')[0].trim();
      }
    }
  }

  const results = checkEnv();

  console.log('🔧 Kognai Environment Variable Check\n');

  let totalSet = 0;
  let totalRequired = 0;

  for (const sub of results) {
    const icon = sub.ready ? '✅' : '❌';
    console.log(`${icon} ${sub.name} (${sub.setCount}/${sub.checks.length})`);

    for (const c of sub.checks) {
      totalSet += c.set ? 1 : 0;
      totalRequired += c.required ? 1 : 0;
      const setIcon = c.set ? '  ✅' : (c.required ? '  ❌' : '  ⚪');
      console.log(`${setIcon} ${c.name}${c.required ? '' : ' (optional)'}`);
    }
    console.log();
  }

  const requiredSet = results.reduce((s, r) => s + r.checks.filter(c => c.required && c.set).length, 0);
  const readySystems = results.filter(r => r.ready).length;

  console.log(`Summary: ${readySystems}/${results.length} subsystems ready | ${requiredSet}/${totalRequired} required vars set | ${totalSet}/${results.reduce((s, r) => s + r.checks.length, 0)} total`);

  const missing = results.flatMap(r => r.checks).filter(c => c.required && !c.set);
  if (missing.length > 0) {
    console.log('\n🔴 Missing required:');
    for (const m of missing) {
      console.log(`  ${m.name} (${m.subsystem})`);
    }
  }
}
