// Sprint 149 Validation — Stripe go-live: webhook PM2 + /stripe-status
// Run: npx ts-node scripts/scs001/validate-sprint-149.ts

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function check(name: string, result: boolean, detail?: string): void {
  if (result) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\nSprint 149 Validation — Stripe go-live\n');

// 1. ecosystem.config.js has kognai-stripe-webhook
const eco = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf-8');
check('ecosystem.config.js contains kognai-stripe-webhook entry', eco.includes('kognai-stripe-webhook'));

// 2. ecosystem.config.js references agents/stripe/server.ts
check('ecosystem.config.js references agents/stripe/server.ts', eco.includes('agents/stripe/server.ts'));

// 3. commands.ts exports handleStripeStatus
const cmds = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
check('commands.ts exports handleStripeStatus', cmds.includes('export async function handleStripeStatus'));

// 4. commands.ts checks STRIPE_SECRET_KEY
check('commands.ts checks STRIPE_SECRET_KEY env var', cmds.includes('STRIPE_SECRET_KEY'));

// 5. index.ts routes /stripe-status
const idx = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');
check('index.ts routes /stripe-status', idx.includes("case '/stripe-status'"));

// 6. handleHelp does NOT contain '(coming soon)' for subscribe
const helpLine = cmds.split('\n').find(l => l.includes('/subscribe') && l.includes('coming soon'));
check('/subscribe help line no longer says (coming soon)', !helpLine, helpLine ?? '');

console.log(`\nResult: ${passed}/${passed + failed} checks passed\n`);
if (failed > 0) process.exit(1);
