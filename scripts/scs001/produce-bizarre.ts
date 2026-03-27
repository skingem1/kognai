#!/usr/bin/env ts-node
/**
 * produce-bizarre.ts — Bizarre Series video producer (Sprint 1415)
 *
 * Uses AI-generated scenes (fal.ai Kling/Wan) + optional voiceover + captions.
 * Topics: real bizarre facts, counterintuitive science, unusual historical events.
 * Requires: FAL_KEY in .env
 *
 * Usage: npx ts-node scripts/scs001/produce-bizarre.ts [--topic "Topic"] [--no-voiceover] [--no-music]
 * Output: Output: /path/to/video.mp4
 */

import { join } from 'path';
import { mkdirSync } from 'fs';

const ROOT = join(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let topic = 'bizarre fact that sounds impossible but is completely real';
  let withVoiceover = true;
  let withMusic = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) topic = args[++i];
    else if (args[i].startsWith('--topic=')) topic = args[i].split('=').slice(1).join('=');
    else if (args[i] === '--no-voiceover') withVoiceover = false;
    else if (args[i] === '--no-music') withMusic = false;
    else if (!args[i].startsWith('--')) topic = args[i];
  }

  const { generateBizarreScript } = await import('./bizarre-scriptgen');
  const { assembleEntertainmentVideo } = await import('./entertainment-assembler');

  const runId = `biz-${Date.now().toString(36)}`;
  const outDir = join(ROOT, 'workspace', 'scs001', 'bizarre-runs', runId);
  mkdirSync(outDir, { recursive: true });

  console.log(`\n🤯 Bizarre Series video — "${topic}"`);
  console.log(`   Options: voiceover=${withVoiceover} music=${withMusic}\n`);

  console.log('Step 1/2: Generating bizarre script...');
  const script = await generateBizarreScript(topic, { withVoiceover, withMusic });
  console.log(`  Script: ${script.scenes.length} scenes, ${script.total_duration_s}s total`);

  console.log('Step 2/2: Assembling video...');
  const outputPath = join(outDir, `${runId}.mp4`);
  // Sprint 1415: pass seriesLabel so assembler generates 'Bizarre Series' outro branding
  const finalPath = await assembleEntertainmentVideo(script, outputPath, { seriesLabel: 'Bizarre Series' });

  console.log(`\nOutput: ${finalPath}`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
