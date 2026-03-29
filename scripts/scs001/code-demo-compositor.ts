/**
 * code-demo-compositor.ts — Assembles code demo steps into final video
 *
 * Takes per-step MP4 segments, optional TTS voiceover, adds Kognai outro.
 * Produces a single 1080x1920 vertical video.
 *
 * Sprint 900
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CodeDemoScript } from './code-demo-scriptgen';

const ROOT = join(__dirname, '..', '..');
const FFMPEG = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

function getVideoDuration(videoPath: string): number {
  const raw = execSync(
    `${FFPROBE} -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    { encoding: 'utf-8' }
  ).trim();
  return parseFloat(raw) || 0;
}

/**
 * Generate TTS narration for each step using macOS `say` command.
 */
function generateStepVoiceovers(
  script: CodeDemoScript,
  outDir: string,
): Array<{ stepId: string; audioPath: string }> {
  const results: Array<{ stepId: string; audioPath: string }> = [];
  mkdirSync(outDir, { recursive: true });

  for (const step of script.steps) {
    if (!step.explanation) continue;
    const aiffPath = join(outDir, `${step.step_id}.aiff`);
    const m4aPath = join(outDir, `${step.step_id}.m4a`);

    try {
      // macOS say → AIFF → M4A (AAC) via ffmpeg
      const txtPath = join(outDir, `${step.step_id}.txt`);
      writeFileSync(txtPath, step.explanation);
      execSync(`say -v Samantha -o "${aiffPath}" -f "${txtPath}"`, { stdio: 'pipe', timeout: 15000 });
      execSync(`${FFMPEG} -y -i "${aiffPath}" -c:a aac -b:a 128k "${m4aPath}"`, { stdio: 'pipe', timeout: 10000 });
      results.push({ stepId: step.step_id, audioPath: m4aPath });
    } catch (err: any) {
      console.warn(`    TTS failed for ${step.step_id}: ${err.message?.slice(0, 100)}`);
    }
  }

  return results;
}

// Sprint 1483: Title card — 3s intro with script title + language badge
function generateTitleCard(title: string, language: string, outPath: string): void {
  const safeTitle = title.replace(/'/g, "\\'").replace(/:/g, '\\:').slice(0, 55);
  const safeLang = language.toUpperCase().replace(/'/g, "\\'").slice(0, 20);
  const fontPath = '/System/Library/Fonts/Helvetica.ttc';
  const font = existsSync(fontPath) ? fontPath : '/System/Library/Fonts/Arial.ttf';

  execSync(
    `${FFMPEG} -y -f lavfi -i "color=c=0x0F0F19:size=1080x1920:rate=30" ` +
    `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
    `-filter_complex ` +
    `"[0:v]` +
    `drawtext=fontfile='${font}':text='💻 CODE DEMO':fontsize=42:fontcolor=0xA78BFA:x=(w-text_w)/2:y=780:` +
    `shadowcolor=black:shadowx=2:shadowy=2,` +
    `drawtext=fontfile='${font}':text='${safeTitle}':fontsize=58:fontcolor=white:x=(w-text_w)/2:y=860:` +
    `shadowcolor=black:shadowx=2:shadowy=2:line_spacing=8,` +
    `drawtext=fontfile='${font}':text='${safeLang}':fontsize=34:fontcolor=0x0F0F19:` +
    `box=1:boxcolor=0xA78BFA:boxborderw=16:x=(w-text_w)/2:y=1020:` +
    `fade=t=in:st=0:d=0.6,fade=t=out:st=2.4:d=0.6[vout]"` +
    ` -map "[vout]" -map 1:a -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 128k -ar 44100 -ac 2 -t 3 "${outPath}"`,
    { stdio: 'pipe', timeout: 15000 }
  );
}

export interface CompositeOptions {
  withVoiceover: boolean;
  withOutro: boolean;
}

/**
 * Assemble code demo from per-step video segments.
 */
export function assembleCodeDemo(
  script: CodeDemoScript,
  stepVideos: Array<{ stepId: string; videoPath: string }>,
  outputPath: string,
  opts: CompositeOptions = { withVoiceover: true, withOutro: true },
): string {
  console.log('  Assembling code demo...');

  const runDir = join(outputPath, '..', '_assembly');
  mkdirSync(runDir, { recursive: true });

  // Step 1a: Generate title card (3s intro)
  const titleCardPath = join(runDir, 'title_card.mp4');
  try {
    generateTitleCard(script.title || 'Code Demo', script.language || 'code', titleCardPath);
    console.log('    Title card generated');
  } catch (tcErr: any) {
    console.warn(`    Title card skipped: ${tcErr.message?.slice(0, 80)}`);
  }

  // Step 1b: Concat title card + all step videos
  const concatList = join(runDir, 'concat.txt');
  const validSteps = stepVideos.filter(s => existsSync(s.videoPath));
  if (validSteps.length === 0) throw new Error('No valid step videos to assemble');

  const concatEntries: string[] = [];
  if (existsSync(titleCardPath)) concatEntries.push(`file '${titleCardPath}'`);
  concatEntries.push(...validSteps.map(s => `file '${s.videoPath}'`));
  writeFileSync(concatList, concatEntries.join('\n'));

  const concatPath = join(runDir, 'concat.mp4');
  execSync(
    `${FFMPEG} -y -f concat -safe 0 -i "${concatList}" ` +
    `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${concatPath}"`,
    { stdio: 'pipe', timeout: 60000 }
  );

  let currentPath = concatPath;

  // Step 2: Add voiceover if requested
  if (opts.withVoiceover) {
    const voiceovers = generateStepVoiceovers(script, join(runDir, 'tts'));

    if (voiceovers.length > 0) {
      // Concat all TTS audio in order
      const audioList = join(runDir, 'audio_concat.txt');
      writeFileSync(audioList, voiceovers.map(v => `file '${v.audioPath}'`).join('\n'));

      const fullAudio = join(runDir, 'narration.m4a');
      execSync(
        `${FFMPEG} -y -f concat -safe 0 -i "${audioList}" -c:a aac -b:a 128k "${fullAudio}"`,
        { stdio: 'pipe', timeout: 15000 }
      );

      // Mix narration + background music with video
      // Background music at -18dB (0.12 volume) under voiceover
      const musicPath = join(ROOT, 'workspace', 'scs001', 'music', 'tech-ambient.mp3');
      const withAudio = join(runDir, 'with_audio.mp4');

      if (existsSync(musicPath)) {
        // Mix voice + music: -stream_loop loops the 60s track, -shortest stops at video end
        execSync(
          `${FFMPEG} -y -i "${currentPath}" -i "${fullAudio}" -stream_loop -1 -i "${musicPath}" ` +
          `-filter_complex "[1:a]apad[voice];[2:a]volume=0.12[music];[voice][music]amix=inputs=2:duration=first[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${withAudio}"`,
          { stdio: 'pipe', timeout: 30000 }
        );
        console.log(`    Voiceover + music: ${voiceovers.length} clips mixed`);
      } else {
        execSync(
          `${FFMPEG} -y -i "${currentPath}" -i "${fullAudio}" ` +
          `-c:v copy -c:a aac -b:a 128k -shortest "${withAudio}"`,
          { stdio: 'pipe', timeout: 30000 }
        );
        console.log(`    Voiceover: ${voiceovers.length} clips (no music found)`);
      }
      currentPath = withAudio;
    }
  }

  // Step 3: Add background music only (no voiceover) or silent audio
  if (!opts.withVoiceover || !existsSync(join(runDir, 'with_audio.mp4'))) {
    const musicPath = join(ROOT, 'workspace', 'scs001', 'music', 'tech-ambient.mp3');
    if (existsSync(musicPath)) {
      const withMusic = join(runDir, 'with_music.mp4');
      execSync(
        `${FFMPEG} -y -i "${currentPath}" -stream_loop -1 -i "${musicPath}" ` +
        `-filter_complex "[1:a]volume=0.18[music]" ` +
        `-map 0:v -map "[music]" -c:v copy -c:a aac -b:a 128k -shortest "${withMusic}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      currentPath = withMusic;
      console.log('    Background music added (no voiceover)');
    } else {
      const withSilence = join(runDir, 'with_silence.mp4');
      execSync(
        `${FFMPEG} -y -i "${currentPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
        `-c:v copy -c:a aac -b:a 128k -shortest "${withSilence}"`,
        { stdio: 'pipe', timeout: 15000 }
      );
      currentPath = withSilence;
    }
  }

  // Step 4: Add Kognai outro
  if (opts.withOutro) {
    const outroPng = join(ROOT, 'assets', 'branding', 'outro-frame.png');
    if (existsSync(outroPng)) {
      const outroVid = join(runDir, 'outro.mp4');
      execSync(
        `${FFMPEG} -y -loop 1 -i "${outroPng}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
        `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p,fade=t=in:st=0:d=0.8" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
        `-c:a aac -b:a 128k -ar 44100 -ac 2 -t 3 "${outroVid}"`,
        { stdio: 'pipe', timeout: 15000 }
      );

      // Re-encode current to match
      const mainNorm = join(runDir, 'main_norm.mp4');
      execSync(
        `${FFMPEG} -y -i "${currentPath}" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 30 ` +
        `-c:a aac -b:a 128k -ar 44100 -ac 2 "${mainNorm}"`,
        { stdio: 'pipe', timeout: 60000 }
      );

      const finalList = join(runDir, 'final_concat.txt');
      writeFileSync(finalList, `file '${mainNorm}'\nfile '${outroVid}'`);

      execSync(
        `${FFMPEG} -y -f concat -safe 0 -i "${finalList}" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
        `-c:a aac -b:a 128k "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );

      console.log('    Outro added');
    } else {
      execSync(`cp "${currentPath}" "${outputPath}"`, { stdio: 'pipe' });
    }
  } else {
    execSync(`cp "${currentPath}" "${outputPath}"`, { stdio: 'pipe' });
  }

  // Cleanup assembly dir
  try { execSync(`rm -rf "${runDir}"`, { stdio: 'pipe' }); } catch {}

  const finalDur = getVideoDuration(outputPath);
  console.log(`  ✅ Assembled: ${finalDur.toFixed(1)}s → ${outputPath}`);

  return outputPath;
}
