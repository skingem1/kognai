/**
 * MovieEditor Agent — SCS-001 v2 Video Assembly
 * Sprint 787 (SCS-001-V2-002)
 *
 * Consumes: ScenarioBundle (from Scorsese)
 * Produces: AssembledVideo (MP4 file + metadata)
 *
 * Pipeline: ScenarioBundle.scenes → TTS → FFmpeg composition → Music mix → Output
 *
 * Cost strategy:
 *   C4 TTS: macOS `say` ($0) or Mimo TTS (if MIMO_API_KEY set)
 *   C5 Music: silence or royalty-free ambient (if music files exist)
 *   FFmpeg: local, $0
 */

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import type {
  ScenarioBundle,
  Scene,
  VisualStyle,
} from '../../contracts/scs-001-v2/scenario-bundle-v1';

const ROOT = join(__dirname, '..', '..');
const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
const OUTPUT_BASE = join(ROOT, 'workspace', 'scs001', 'v2-output');
const MUSIC_DIR = join(ROOT, 'assets', 'music');

export interface AssembledVideo {
  video_id: string;
  scenario_id: string;
  file_path: string;
  duration_seconds: number;
  aspect_ratio: '9:16';
  scene_count: number;
  has_voiceover: boolean;
  has_music: boolean;
  tts_method: 'macos-say' | 'mimo' | 'none';
  assembly_seconds: number;
  created_at: string;
}

interface TTSResult {
  scene_name: string;
  audio_path: string;
  duration_s: number;
  success: boolean;
}

// Visual style → color mapping for mock/color-block mode
const STYLE_COLORS: Record<VisualStyle, string> = {
  kinetic_text:     '0x1A1A2E',
  split_screen:     '0x16213E',
  react_cam:        '0x0F3460',
  b_roll_montage:   '0x533483',
  screen_recording: '0xE94560',
  meme_template:    '0x2D2D44',
  documentary:      '0x3D5A80',
};

export class MovieEditorAgent {
  private outputDir: string;

  constructor() {
    this.outputDir = OUTPUT_BASE;
    mkdirSync(this.outputDir, { recursive: true });
    console.log('[MovieEditor] Initialized — FFmpeg composition engine');
  }

  async assemble(bundle: ScenarioBundle): Promise<AssembledVideo> {
    const startTime = Date.now();
    const videoId = 'v2-' + randomUUID().substring(0, 8);
    const runDir = join(this.outputDir, videoId);
    mkdirSync(join(runDir, 'tts'), { recursive: true });

    console.log(`[MovieEditor] Assembling: ${bundle.title} (${bundle.scenes.length} scenes, ${bundle.total_duration_s}s)`);

    // Step 1: Generate TTS for each scene
    const ttsResults = await this.generateTTS(bundle, join(runDir, 'tts'));
    const hasVoiceover = ttsResults.some(t => t.success);

    // Step 2: Build scene video segments (Captions.ai avatar + fal.ai B-roll + fallback)
    const scenePaths = await this.buildSceneSegments(bundle.scenes, runDir);

    // Step 3: Concatenate scenes into single video
    const rawVideoPath = join(runDir, 'raw.mp4');
    this.concatenateScenes(scenePaths, rawVideoPath);

    // Step 4: Mix TTS audio onto video
    const withAudioPath = join(runDir, 'with-audio.mp4');
    if (hasVoiceover) {
      this.mixTTSAudio(rawVideoPath, ttsResults, withAudioPath);
    }

    // Step 5: Add background music (if available)
    const finalPath = join(runDir, `${videoId}.mp4`);
    const musicPath = this.findBackgroundMusic(bundle.scenes[0]?.music_cue);
    if (musicPath && existsSync(hasVoiceover ? withAudioPath : rawVideoPath)) {
      this.mixMusic(hasVoiceover ? withAudioPath : rawVideoPath, musicPath, finalPath);
    } else {
      // Copy raw or with-audio as final
      const src = hasVoiceover && existsSync(withAudioPath) ? withAudioPath : rawVideoPath;
      if (existsSync(src)) {
        execSync(`cp "${src}" "${finalPath}"`, { stdio: 'pipe' });
      }
    }

    // Step 6: Write metadata
    const assemblyTime = (Date.now() - startTime) / 1000;
    const result: AssembledVideo = {
      video_id: videoId,
      scenario_id: bundle.scenario_id,
      file_path: finalPath,
      duration_seconds: bundle.total_duration_s,
      aspect_ratio: '9:16',
      scene_count: bundle.scenes.length,
      has_voiceover: hasVoiceover,
      has_music: !!musicPath,
      tts_method: hasVoiceover ? (process.env.MIMO_API_KEY ? 'mimo' : 'macos-say') : 'none',
      assembly_seconds: assemblyTime,
      created_at: new Date().toISOString(),
    };

    writeFileSync(join(runDir, 'metadata.json'), JSON.stringify(result, null, 2));
    console.log(`[MovieEditor] Complete: ${videoId} (${assemblyTime.toFixed(1)}s assembly)`);
    return result;
  }

  private async generateTTS(bundle: ScenarioBundle, ttsDir: string): Promise<TTSResult[]> {
    const results: TTSResult[] = [];
    const voice = bundle.tts_voice || 'Samantha';

    // Map TTS voices to macOS say voices
    const voiceMap: Record<string, string> = {
      alloy: 'Samantha', nova: 'Samantha', echo: 'Daniel',
      onyx: 'Alex', shimmer: 'Karen', fable: 'Moira',
    };
    const macVoice = voiceMap[voice] || 'Samantha';

    for (let i = 0; i < bundle.scenes.length; i++) {
      const scene = bundle.scenes[i];
      if (!scene.voiceover || scene.voiceover.trim() === '') {
        results.push({ scene_name: scene.scene_name, audio_path: '', duration_s: 0, success: false });
        continue;
      }

      const audioPath = join(ttsDir, `scene_${i}_${scene.scene_name}.aiff`);
      try {
        const text = scene.voiceover.replace(/"/g, '\\"').replace(/'/g, "'\\''");
        execSync(`say -v "${macVoice}" -o "${audioPath}" "${text}"`, {
          stdio: 'pipe', timeout: 15000,
        });
        results.push({
          scene_name: scene.scene_name,
          audio_path: audioPath,
          duration_s: scene.duration_s,
          success: true,
        });
      } catch (err) {
        console.warn(`[MovieEditor] TTS failed for scene ${i}: ${(err as Error).message?.slice(0, 100)}`);
        results.push({ scene_name: scene.scene_name, audio_path: '', duration_s: 0, success: false });
      }
    }

    const ok = results.filter(r => r.success).length;
    console.log(`[MovieEditor] TTS: ${ok}/${bundle.scenes.length} scenes voiced`);
    return results;
  }

  private async buildSceneSegments(scenes: Scene[], runDir: string): Promise<string[]> {
    const paths: string[] = [];

    try {
      // Use real video generation (Captions.ai avatar + fal.ai B-roll + Pillow terminal)
      const { generateAllSegments } = await import('../../scripts/scs001/video-segment-generator');
      const segDir = join(runDir, 'segments');

      console.log(`[MovieEditor] Generating ${scenes.length} REAL video segments...`);
      const results = await generateAllSegments(scenes, segDir);

      for (const result of results) {
        if (existsSync(result.path)) {
          paths.push(result.path);
        }
      }

      const sources = results.map(r => r.source);
      const totalCost = results.reduce((sum, r) => sum + r.cost_usd, 0);
      console.log(`[MovieEditor] ${paths.length}/${scenes.length} segments ready (sources: ${[...new Set(sources)].join(',')} | cost: $${totalCost.toFixed(2)})`);

    } catch (err: any) {
      // Fallback: generate color blocks if real video generation fails entirely
      console.warn(`[MovieEditor] Real video gen failed (${err.message}), falling back to color blocks`);
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const segPath = join(runDir, `scene_${i}.mp4`);
        const color = STYLE_COLORS[scene.visual_style] || '0x1A1A2E';
        try {
          execSync(
            `${FFMPEG} -y -f lavfi -i "color=c=${color}:s=1080x1920:d=${scene.duration_s}:r=30" ` +
            `-c:v libx264 -pix_fmt yuv420p -t ${scene.duration_s} "${segPath}"`,
            { stdio: 'pipe', timeout: 30000 }
          );
          paths.push(segPath);
        } catch {}
      }
    }

    return paths;
  }

  private concatenateScenes(scenePaths: string[], outputPath: string): void {
    if (scenePaths.length === 0) {
      console.warn('[MovieEditor] No scenes to concatenate');
      return;
    }

    // Step 1: Normalize ALL segments to the same codec/format before concat.
    // Different sources (Kling, Captions.ai, Pillow) output different codecs.
    // Re-encode each to H.264 1080x1920 30fps with silent audio track.
    const normalizedPaths: string[] = [];
    const normDir = join(dirname(outputPath), 'normalized');
    mkdirSync(normDir, { recursive: true });

    for (let i = 0; i < scenePaths.length; i++) {
      const normPath = join(normDir, `norm_${i}.mp4`);
      try {
        execSync(
          `${FFMPEG} -y -i "${scenePaths[i]}" ` +
          `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
          `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" ` +
          `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 128k -shortest ` +
          `"${normPath}"`,
          { stdio: 'pipe', timeout: 60000 }
        );
        normalizedPaths.push(normPath);
      } catch (err) {
        console.warn(`[MovieEditor] Normalize scene ${i} failed: ${(err as Error).message?.slice(0, 80)}`);
      }
    }

    if (normalizedPaths.length === 0) {
      console.warn('[MovieEditor] No normalized scenes — concat aborted');
      return;
    }

    // Step 2: Concat normalized segments (now all same codec — -c copy is safe)
    const listPath = outputPath.replace('.mp4', '-concat.txt');
    const listContent = normalizedPaths.map(p => `file '${p}'`).join('\n');
    writeFileSync(listPath, listContent);

    try {
      execSync(
        `${FFMPEG} -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
      console.log(`[MovieEditor] Concatenated ${normalizedPaths.length} scenes (all normalized to H.264 1080x1920 30fps)`);
    } catch (err) {
      console.warn(`[MovieEditor] Concat failed: ${(err as Error).message?.slice(0, 100)}`);
    }
  }

  private mixTTSAudio(videoPath: string, ttsResults: TTSResult[], outputPath: string): void {
    const validTTS = ttsResults.filter(t => t.success && t.audio_path);
    if (validTTS.length === 0) return;

    // Build per-scene TTS audio with correct timing using adelay + amix
    // Each TTS segment plays at the right scene offset
    try {
      // Calculate scene start offsets
      let offset = 0;
      const inputs: string[] = ['-i', `"${videoPath}"`];
      const delays: string[] = [];

      for (let i = 0; i < validTTS.length; i++) {
        const tts = validTTS[i];
        inputs.push('-i', `"${tts.audio_path}"`);
        const delayMs = Math.round(offset * 1000);
        delays.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`);
        offset += tts.duration_s;
      }

      // Mix all delayed audio tracks together
      const mixInputs = validTTS.map((_, i) => `[a${i}]`).join('');
      const filterComplex = delays.join('; ') + `; ${mixInputs}amix=inputs=${validTTS.length}:duration=longest:dropout_transition=0[mixed]`;

      execSync(
        `${FFMPEG} -y ${inputs.join(' ')} ` +
        `-filter_complex "${filterComplex}" ` +
        `-map 0:v -map "[mixed]" -c:v copy -c:a aac -b:a 128k "${outputPath}"`,
        { stdio: 'pipe', timeout: 120000 }
      );
      console.log(`[MovieEditor] TTS mixed: ${validTTS.length} segments with per-scene timing`);
    } catch (err) {
      console.warn(`[MovieEditor] Per-scene TTS mix failed: ${(err as Error).message?.slice(0, 80)}`);
      // Fallback: just overlay first TTS segment
      try {
        execSync(
          `${FFMPEG} -y -i "${videoPath}" -i "${validTTS[0].audio_path}" ` +
          `-map 0:v -map 1:a -c:v copy -c:a aac -shortest "${outputPath}"`,
          { stdio: 'pipe', timeout: 60000 }
        );
        console.log('[MovieEditor] TTS fallback: first segment only');
      } catch (err2) {
        console.warn(`[MovieEditor] Audio mix failed entirely: ${(err2 as Error).message?.slice(0, 80)}`);
      }
    }
  }

  private findBackgroundMusic(cue?: string): string | null {
    if (!existsSync(MUSIC_DIR)) return null;
    // Look for music file matching the cue
    const candidates = [
      cue ? join(MUSIC_DIR, `${cue}.mp3`) : '',
      join(MUSIC_DIR, 'ambient.mp3'),
      join(MUSIC_DIR, 'background.mp3'),
    ].filter(Boolean);

    for (const path of candidates) {
      if (existsSync(path)) return path;
    }
    return null;
  }

  private mixMusic(videoPath: string, musicPath: string, outputPath: string): void {
    try {
      execSync(
        `${FFMPEG} -y -i "${videoPath}" -i "${musicPath}" ` +
        `-filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first[out]" ` +
        `-map 0:v -map "[out]" -c:v copy -c:a aac -shortest "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
      console.log('[MovieEditor] Background music mixed (15% volume)');
    } catch {
      // Copy without music if mix fails
      execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
      console.warn('[MovieEditor] Music mix failed, using video without music');
    }
  }

  /**
   * Batch mode: assemble multiple scenarios.
   */
  async assembleBatch(bundles: ScenarioBundle[]): Promise<AssembledVideo[]> {
    const results: AssembledVideo[] = [];
    for (const bundle of bundles) {
      try {
        const video = await this.assemble(bundle);
        results.push(video);
      } catch (err) {
        console.error(`[MovieEditor] Failed: ${(err as Error).message}`);
      }
    }
    console.log(`[MovieEditor] Batch: ${results.length}/${bundles.length} assembled`);
    return results;
  }
}
