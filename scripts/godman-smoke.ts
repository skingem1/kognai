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
      // Sprint 1070: show up to 4 lines of relevant failure output
      const outputLines = output.split('\n').filter(l => l.trim());
      const relevantLines = outputLines.filter(l =>
        l.includes('Error') || l.includes('FAIL') || l.includes('assert') ||
        l.includes('expect') || l.includes('throw') || l.includes('×') || l.includes('✗')
      ).slice(0, 4);
      const showLines = relevantLines.length > 0 ? relevantLines : outputLines.slice(0, 4);
      lines.push('```');
      for (const l of showLines) lines.push(l.trim().slice(0, 100));
      lines.push('```');
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
