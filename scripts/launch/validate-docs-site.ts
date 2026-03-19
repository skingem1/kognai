/**
 * Validate docs-site structure for Sprint 260
 * Checks: VitePress config, index, architecture, agents, API docs all exist and have content.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../docs-site');

interface Check {
  name: string;
  file: string;
  minBytes: number;
  mustContain?: string[];
}

const checks: Check[] = [
  {
    name: 'VitePress config',
    file: '.vitepress/config.ts',
    minBytes: 200,
    mustContain: ['defineConfig', 'Kognai', 'sidebar'],
  },
  {
    name: 'Index / landing page',
    file: 'index.md',
    minBytes: 300,
    mustContain: ['Sovereign AI Runtime', 'features'],
  },
  {
    name: 'Architecture page',
    file: 'architecture.md',
    minBytes: 1000,
    mustContain: ['9-Layer', 'Model Router', 'Tier'],
  },
  {
    name: 'Agent catalog',
    file: 'agents.md',
    minBytes: 1000,
    mustContain: ['scs001', 'ceo', 'achiri'],
  },
  {
    name: 'ClawRouter API reference',
    file: 'api/clawrouter.md',
    minBytes: 1000,
    mustContain: ['RoutingDecision', 'KognaiRouter', 'ACP'],
  },
  {
    name: 'package.json',
    file: 'package.json',
    minBytes: 50,
    mustContain: ['vitepress'],
  },
];

let passed = 0;
let failed = 0;

for (const check of checks) {
  const fullPath = path.join(ROOT, check.file);
  const label = `[${check.name}]`;

  if (!fs.existsSync(fullPath)) {
    console.error(`FAIL ${label} — file not found: ${check.file}`);
    failed++;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');

  if (content.length < check.minBytes) {
    console.error(`FAIL ${label} — too small: ${content.length} bytes (min ${check.minBytes})`);
    failed++;
    continue;
  }

  if (check.mustContain) {
    const missing = check.mustContain.filter((s) => !content.includes(s));
    if (missing.length > 0) {
      console.error(`FAIL ${label} — missing content: ${missing.join(', ')}`);
      failed++;
      continue;
    }
  }

  console.log(`PASS ${label} — ${content.length} bytes`);
  passed++;
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed out of ${checks.length} ---`);

if (failed > 0) {
  console.error('\nVALIDATION FAILED');
  process.exit(1);
} else {
  console.log('\nVALIDATION PASSED');
}
