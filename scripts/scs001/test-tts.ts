#!/usr/bin/env ts-node
/**
 * TTS Integration Test — Sprint 457
 *
 * Tests both ElevenLabs API and local TTS (macOS say).
 * Generates a sample voiceover audio file and reports results.
 *
 * Usage: npx ts-node --transpile-only scripts/scs001/test-tts.ts [--elevenlabs] [--local] [--both]
 */

import { existsSync, mkdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'workspace', 'scs001', 'tts-test');

// Sample texts for testing
const SAMPLE_TEXTS = [
  {
    id: 'hook',
    text: 'You won\'t believe what this AI just did. In just 30 seconds, it changed everything we know about content creation.',
  },
  {
    id: 'narration',
    text: 'The tech industry moves fast, but some innovations stand out. Today we\'re looking at something that could reshape how creators work.',
  },
  {
    id: 'short',
    text: 'This changes everything.',
  },
];

interface TestResult {
  provider: string;
  success: boolean;
  error?: string;
  audioFile?: string;
  fileSizeBytes?: number;
  durationEstimate?: number;
  costEstimate?: number;
  latencyMs?: number;
}

async function testElevenLabs(): Promise<TestResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { provider: 'ElevenLabs', success: false, error: 'ELEVENLABS_API_KEY not set' };
  }

  const voiceId = process.env.TTS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'; // Sarah
  const modelId = process.env.TTS_MODEL_ID ?? 'eleven_flash_v2_5';
  const sample = SAMPLE_TEXTS[0];
  const outputPath = join(OUT_DIR, `elevenlabs-test-${sample.id}.mp3`);

  const start = Date.now();

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: sample.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text();
      return { provider: 'ElevenLabs', success: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}`, latencyMs };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const { writeFileSync } = require('fs');
    writeFileSync(outputPath, buffer);

    const fileSize = statSync(outputPath).size;
    const durationEstimate = (sample.text.length / 750) * 60;
    const costEstimate = sample.text.length * 0.0003;

    return {
      provider: 'ElevenLabs',
      success: true,
      audioFile: outputPath,
      fileSizeBytes: fileSize,
      durationEstimate: Math.round(durationEstimate * 10) / 10,
      costEstimate: Math.round(costEstimate * 10000) / 10000,
      latencyMs,
    };
  } catch (e: any) {
    return { provider: 'ElevenLabs', success: false, error: e.message, latencyMs: Date.now() - start };
  }
}

function testLocalTTS(): TestResult {
  // Check if macOS say is available
  try {
    execSync('which say', { stdio: 'pipe' });
  } catch {
    return { provider: 'Local (macOS say)', success: false, error: 'macOS say command not available' };
  }

  // Check if FFmpeg is available for AIFF → MP3 conversion
  let hasFFmpeg = false;
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    hasFFmpeg = true;
  } catch {}

  const sample = SAMPLE_TEXTS[0];
  const aiffPath = join(OUT_DIR, `local-test-${sample.id}.aiff`);
  const mp3Path = join(OUT_DIR, `local-test-${sample.id}.mp3`);
  const start = Date.now();

  try {
    // Generate AIFF with say
    const voice = process.env.LOCAL_TTS_VOICE ?? 'Samantha';
    const rate = process.env.LOCAL_TTS_RATE ?? '175';
    execSync(`say -v ${voice} -r ${rate} -o "${aiffPath}" "${sample.text.replace(/"/g, '\\"')}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    const latencyMs = Date.now() - start;
    let outputFile = aiffPath;
    let fileSize = statSync(aiffPath).size;

    // Convert to MP3 if FFmpeg available
    if (hasFFmpeg) {
      try {
        execSync(`ffmpeg -y -i "${aiffPath}" -codec:a libmp3lame -b:a 128k "${mp3Path}"`, {
          timeout: 30000,
          stdio: 'pipe',
        });
        outputFile = mp3Path;
        fileSize = statSync(mp3Path).size;
        // Clean up AIFF
        try { require('fs').unlinkSync(aiffPath); } catch {}
      } catch {}
    }

    // Get actual duration
    let duration = 0;
    try {
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputFile}"`,
        { timeout: 5000, stdio: 'pipe' }
      ).toString().trim();
      duration = parseFloat(out) || 0;
    } catch {
      duration = (sample.text.length / 750) * 60; // estimate
    }

    return {
      provider: 'Local (macOS say)',
      success: true,
      audioFile: outputFile,
      fileSizeBytes: fileSize,
      durationEstimate: Math.round(duration * 10) / 10,
      costEstimate: 0,
      latencyMs,
    };
  } catch (e: any) {
    return { provider: 'Local (macOS say)', success: false, error: e.message, latencyMs: Date.now() - start };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testEl = args.includes('--elevenlabs') || args.includes('--both') || args.length === 0;
  const testLocal = args.includes('--local') || args.includes('--both') || args.length === 0;

  mkdirSync(OUT_DIR, { recursive: true });

  console.log('🔊 TTS Integration Test\n');
  console.log(`Sample text: "${SAMPLE_TEXTS[0].text.slice(0, 60)}..."\n`);

  const results: TestResult[] = [];

  if (testLocal) {
    console.log('Testing Local TTS (macOS say)...');
    const localResult = testLocalTTS();
    results.push(localResult);
    printResult(localResult);
  }

  if (testEl) {
    console.log('Testing ElevenLabs API...');
    const elResult = await testElevenLabs();
    results.push(elResult);
    printResult(elResult);
  }

  // Summary
  console.log('\n--- Summary ---');
  const passing = results.filter(r => r.success);
  console.log(`${passing.length}/${results.length} TTS providers working`);

  if (passing.length === 0) {
    console.log('\n❌ No TTS providers available. Videos will have no voiceover.');
    console.log('Fix: Set ELEVENLABS_API_KEY or ensure macOS say is available.');
    process.exit(1);
  }

  console.log('\n✅ TTS ready — at least 1 provider working');

  // Recommend
  const elOk = results.find(r => r.provider === 'ElevenLabs' && r.success);
  const localOk = results.find(r => r.provider.includes('Local') && r.success);

  if (elOk) {
    console.log(`  Recommended: ElevenLabs (professional quality, ~$${elOk.costEstimate}/segment)`);
  }
  if (localOk) {
    console.log(`  Fallback: Local TTS ($0.00, good quality for macOS)`);
  }
}

function printResult(r: TestResult) {
  if (r.success) {
    console.log(`  ✅ ${r.provider}`);
    console.log(`     File: ${r.audioFile}`);
    console.log(`     Size: ${Math.round((r.fileSizeBytes ?? 0) / 1024)}KB`);
    console.log(`     Duration: ~${r.durationEstimate}s`);
    console.log(`     Cost: $${r.costEstimate}`);
    console.log(`     Latency: ${r.latencyMs}ms`);
  } else {
    console.log(`  ❌ ${r.provider}: ${r.error}`);
  }
  console.log();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
