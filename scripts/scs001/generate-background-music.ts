// Sprint 445: Background Music Generator — FFmpeg-based ambient tracks
// Generates 3 ambient background music tracks using FFmpeg synthesis.
// No external files needed — pure audio synthesis via FFmpeg filters.
//
// Tracks:
//   tech-ambient.mp3  — filtered noise + sine pad (energetic tech content)
//   lo-fi-pulse.mp3   — gentle bass pulse + vinyl crackle (story/question hooks)
//   calm-pad.mp3      — warm sine chord + subtle movement (authority/proof hooks)
//
// Usage: npx ts-node scripts/scs001/generate-background-music.ts
// Output: workspace/scs001/music/

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const MUSIC_DIR = join(ROOT, 'workspace', 'scs001', 'music');
const DURATION = 30; // seconds — long enough for any video, loops if needed

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function hasFfmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function generateTrack(name: string, filterComplex: string): void {
  const outPath = join(MUSIC_DIR, `${name}.mp3`);
  if (existsSync(outPath)) {
    console.log(`  [skip] ${name}.mp3 already exists`);
    return;
  }

  console.log(`  [gen] ${name}.mp3 ...`);
  try {
    execSync(
      `ffmpeg -y -f lavfi -i "${filterComplex}" -t ${DURATION} -ar 44100 -ac 2 -b:a 128k "${outPath}"`,
      { stdio: 'ignore', timeout: 30000 }
    );
    console.log(`  [ok] ${name}.mp3`);
  } catch (err: any) {
    console.error(`  [fail] ${name}: ${err.message?.slice(0, 100)}`);
  }
}

function main(): void {
  if (!hasFfmpeg()) {
    console.error('[music-gen] FFmpeg not found. Install it first.');
    process.exit(1);
  }

  ensureDir(MUSIC_DIR);
  console.log('\n🎵 Generating background music tracks...\n');

  // Track 1: Tech Ambient — filtered noise + low sine drone
  // Creates a subtle, energetic atmosphere for tech content
  generateTrack('tech-ambient',
    'anoisesrc=d=${DURATION}:c=pink:r=44100:a=0.03,lowpass=f=800,highpass=f=200[noise];' +
    'sine=frequency=110:duration=${DURATION}:sample_rate=44100,volume=0.05[bass];' +
    'sine=frequency=220:duration=${DURATION}:sample_rate=44100,volume=0.03[mid];' +
    '[noise][bass][mid]amix=inputs=3:duration=longest:weights=1 0.8 0.5'
  );

  // Track 2: Lo-Fi Pulse — gentle rhythmic pulse + noise floor
  // Warm, story-like feel for narrative hooks
  generateTrack('lo-fi-pulse',
    'sine=frequency=80:duration=${DURATION}:sample_rate=44100,volume=0.06,tremolo=f=2:d=0.3[pulse];' +
    'anoisesrc=d=${DURATION}:c=brown:r=44100:a=0.02,lowpass=f=500[warm];' +
    '[pulse][warm]amix=inputs=2:duration=longest'
  );

  // Track 3: Calm Pad — warm chord drone + subtle vibrato
  // Authoritative, factual feel for proof/authority hooks
  generateTrack('calm-pad',
    'sine=frequency=165:duration=${DURATION}:sample_rate=44100,volume=0.04[root];' +
    'sine=frequency=196:duration=${DURATION}:sample_rate=44100,volume=0.03[third];' +
    'sine=frequency=247:duration=${DURATION}:sample_rate=44100,volume=0.025[fifth];' +
    '[root][third][fifth]amix=inputs=3:duration=longest:weights=1 0.7 0.5,tremolo=f=0.3:d=0.15'
  );

  console.log('\n✅ Background music generation complete.');
  console.log(`   Output: ${MUSIC_DIR}/`);
}

main();
