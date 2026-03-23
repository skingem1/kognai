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
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
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
    const mp3Path = join(outDir, `${step.step_id}.mp3`);

    try {
      // macOS say → AIFF → MP3 via ffmpeg
      // Write text to file to avoid shell escaping issues
      const txtPath = join(outDir, `${step.step_id}.txt`);
      writeFileSync(txtPath, step.explanation);
      execSync(`say -v Samantha -o "${aiffPath}" -f "${txtPath}"`, { stdio: 'pipe', timeout: 15000 });
      execSync(`${FFMPEG} -y -i "${aiffPath}" -c:a aac -b:a 128k "${mp3Path}"`, { stdio: 'pipe', timeout: 10000 });
      results.push({ stepId: step.step_id, audioPath: mp3Path });
    } catch {
      console.warn(`    TTS failed for ${step.step_id}`);
    }
  }

  return results;
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

  // Step 1: Concat all step videos
  const concatList = join(runDir, 'concat.txt');
  const validSteps = stepVideos.filter(s => existsSync(s.videoPath));
  if (validSteps.length === 0) throw new Error('No valid step videos to assemble');

  writeFileSync(concatList, validSteps.map(s => `file '${s.videoPath}'`).join('\n'));

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

      const fullAudio = join(runDir, 'narration.mp3');
      execSync(
        `${FFMPEG} -y -f concat -safe 0 -i "${audioList}" -c:a aac -b:a 128k "${fullAudio}"`,
        { stdio: 'pipe', timeout: 15000 }
      );

      // Mix narration with video (replace silent video audio)
      const withVoice = join(runDir, 'with_voice.mp4');
      execSync(
        `${FFMPEG} -y -i "${currentPath}" -i "${fullAudio}" ` +
        `-c:v copy -c:a aac -b:a 128k -shortest "${withVoice}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      currentPath = withVoice;
      console.log(`    Voiceover: ${voiceovers.length} clips mixed`);
    }
  }

  // Step 3: Add silent audio track if no voiceover (needed for outro concat)
  if (!opts.withVoiceover || !existsSync(join(runDir, 'with_voice.mp4'))) {
    const withSilence = join(runDir, 'with_silence.mp4');
    execSync(
      `${FFMPEG} -y -i "${currentPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
      `-c:v copy -c:a aac -b:a 128k -shortest "${withSilence}"`,
      { stdio: 'pipe', timeout: 15000 }
    );
    currentPath = withSilence;
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
