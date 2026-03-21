#!/usr/bin/env ts-node
/**
 * Sprint 647 Validation — Content Quality Gate
 * Checks that SRT files contain real LLM-generated content, not template phrases.
 * Scans: recent pipeline runs + multiformat runs.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const TEMPLATE_PHRASES = [
  'challenges the conventional wisdom on',
  'insiders have been tracking for months',
  'reshape how we approach this entire field within 12 months',
  'companies without a strategy face 6-12 month competitive gaps',
  'signaling a structural shift that affects budgets',
  'made a statement that challenges the conventional wisdom',
];

let passed = 0;
let failed = 0;
let warnings = 0;

function assert(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

function warn(label: string, detail?: string) {
  console.log(`  ⚠ ${label}${detail ? ` — ${detail}` : ''}`);
  warnings++;
}

function checkSrtForTemplates(srtPath: string): { hasTemplate: boolean; phrases: string[] } {
  const content = readFileSync(srtPath, 'utf-8').toLowerCase();
  const found = TEMPLATE_PHRASES.filter(p => content.includes(p.toLowerCase()));
  return { hasTemplate: found.length > 0, phrases: found };
}

async function main() {
  console.log('\n=== Sprint 647 Validation — Content Quality Gate ===\n');

  // 1. Check LLM_REWRITE env var
  const llmRewrite = process.env.LLM_REWRITE;
  assert('LLM_REWRITE env var is set', llmRewrite === '1' || llmRewrite === 'true',
    `LLM_REWRITE=${llmRewrite ?? 'UNSET'}`);

  // 2. Check ecosystem.config.js has LLM_REWRITE in scs001-pipeline
  const ecoPath = join(ROOT, 'ecosystem.config.js');
  if (existsSync(ecoPath)) {
    const ecoContent = readFileSync(ecoPath, 'utf-8');
    // Find scs001-pipeline section and check for LLM_REWRITE
    const pipelineIdx = ecoContent.indexOf('scs001-pipeline');
    const liveIdx = ecoContent.indexOf('scs001-live');
    if (pipelineIdx > -1 && liveIdx > -1) {
      const pipelineSection = ecoContent.substring(pipelineIdx, liveIdx);
      assert('ecosystem.config.js scs001-pipeline has LLM_REWRITE',
        pipelineSection.includes('LLM_REWRITE'));
      assert('ecosystem.config.js scs001-pipeline has SCS_EDITING_MODE',
        pipelineSection.includes('SCS_EDITING_MODE'));
    } else {
      warn('Could not parse ecosystem.config.js sections');
    }
  }

  // 3. Check .env has LLM_REWRITE=1
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    assert('.env has LLM_REWRITE=1',
      envContent.includes('LLM_REWRITE=1') || envContent.includes('LLM_REWRITE=true'));
  }

  // 4. Scan recent multiformat runs for template text
  console.log('\n--- Multiformat Run SRT Check ---');
  const mfDir = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
  if (existsSync(mfDir)) {
    const runs = readdirSync(mfDir).filter(d => d.startsWith('mf-')).sort().slice(-5);
    let totalSrts = 0;
    let templateSrts = 0;

    for (const run of runs) {
      const outputDir = join(mfDir, run, 'output');
      if (!existsSync(outputDir)) continue;
      const srts = readdirSync(outputDir).filter(f => f.endsWith('.srt'));
      for (const srt of srts) {
        totalSrts++;
        const check = checkSrtForTemplates(join(outputDir, srt));
        if (check.hasTemplate) {
          templateSrts++;
          warn(`Template text in ${run}/${srt}`, check.phrases.join(', '));
        }
      }
    }

    assert(`Multiformat SRTs: ${totalSrts - templateSrts}/${totalSrts} have unique content`,
      templateSrts === 0, `${templateSrts} SRTs still have template text`);
  } else {
    warn('No multiformat-runs directory found');
  }

  // 5. Check ScriptAgent has runAsync method
  console.log('\n--- Code Checks ---');
  const scriptAgentPath = join(ROOT, 'agents', 'scs001-script', 'index.ts');
  if (existsSync(scriptAgentPath)) {
    const scriptContent = readFileSync(scriptAgentPath, 'utf-8');
    assert('ScriptAgent has runAsync method', scriptContent.includes('async runAsync'));
    assert('ScriptAgent checks LLM_REWRITE env', scriptContent.includes('LLM_REWRITE'));
    assert('ScriptAgent calls rewriteScript', scriptContent.includes('rewriteScript'));
  }

  // 6. Check orchestrator calls shouldUseLLMRewrite
  const orchPath = join(ROOT, 'agents', 'scs001-orchestrator', 'index.ts');
  if (existsSync(orchPath)) {
    const orchContent = readFileSync(orchPath, 'utf-8');
    assert('Orchestrator has shouldUseLLMRewrite', orchContent.includes('shouldUseLLMRewrite'));
    assert('Orchestrator calls runAsync when LLM enabled', orchContent.includes('agent.runAsync'));
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warnings} warnings ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
