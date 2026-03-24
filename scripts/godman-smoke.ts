// Sprint 1015: Godman Protocols — all-7 smoke test runner
// Usage: npx ts-node --transpile-only scripts/godman-smoke.ts
// Or called from Telegram via /godman-smoke

import * as path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
const PROTOCOLS = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs'];

interface ProtoResult {
  proto: string;
  pass: boolean;
  output: string;
}

function runSmoke(): ProtoResult[] {
  const results: ProtoResult[] = [];
  for (const proto of PROTOCOLS) {
    const cwd = path.join(ROOT, 'workspace', 'godman-protocols', proto);
    const r = spawnSync('npm', ['run', 'test'], {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
    });
    const combined = ((r.stdout ?? '') + (r.stderr ?? '')).trim();
    const pass = r.status === 0 && r.error == null;
    results.push({ proto, pass, output: combined.slice(0, 300) });
  }
  return results;
}

export function runGodmanSmoke(): string {
  const results = runSmoke();
  const lines: string[] = ['*Godman Smoke Tests*', ''];
  let allPass = true;
  for (const { proto, pass, output } of results) {
    lines.push(`${pass ? '✅' : '❌'} @godman-protocols/${proto}`);
    if (!pass) {
      allPass = false;
      const errLine = output.split('\n').find(l => l.includes('FAIL') || l.includes('Error')) ?? '';
      if (errLine) lines.push(`   ↳ \`${errLine.trim().slice(0, 80)}\``);
    }
  }
  lines.push('');
  lines.push(allPass ? '✅ All 7 protocols pass — ready to publish' : '❌ Fix failures before publishing');
  return lines.join('\n');
}

// CLI
if (require.main === module) {
  const results = runSmoke();
  let allPass = true;
  for (const { proto, pass, output } of results) {
    console.log(`${pass ? '✅' : '❌'}  @godman-protocols/${proto}`);
    if (!pass) { allPass = false; console.log('   ', output.split('\n').slice(0, 3).join('\n   ')); }
  }
  console.log(allPass ? '\n✅ All pass' : '\n❌ Failures found');
  process.exit(allPass ? 0 : 1);
}
