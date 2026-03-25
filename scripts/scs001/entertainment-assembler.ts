/**
 * entertainment-assembler.ts — Assembles AI-generated entertainment video
 *
 * Generates video clips for each scene via fal.ai (Kling/LTX),
 * stitches with xfade transitions, adds optional voiceover + music + captions.
 *
 * Sprint 901
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { EntertainmentScript, EntertainmentScene } from './entertainment-scriptgen';

const ROOT = join(__dirname, '..', '..');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

function getVideoDuration(p: string): number {
  return parseFloat(execSync(`${FFPROBE} -v quiet -show_entries format=duration -of csv=p=0 "${p}"`, { encoding: 'utf-8' }).trim()) || 0;
}

/** Normalize video to canonical 1080x1920 30fps h264.
 * Resilient: tries scale+encode first, falls back to simpler re-encode if that fails. */
function normalizeClip(input: string, output: string, duration: number): void {
  try {
    // Single-pass: scale + pad + trim + encode in one command
    execSync(
      `${FFMPEG} -y -i "${input}" -t ${duration} ` +
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an "${output}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
  } catch {
    // Fallback: just re-encode without scale (some raw formats don't like complex filter chains)
    try {
      execSync(
        `${FFMPEG} -y -i "${input}" -t ${duration} ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an "${output}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
    } catch {
      // Last resort: copy as-is (may not be 1080x1920 but at least it exists)
      execSync(`cp "${input}" "${output}"`, { stdio: 'pipe' });
    }
  }
}

/** Generate AI video clip for a scene.
 * Hero scene (index 0) uses Kling for best quality.
 * All other scenes use Wan 2.1 for cost efficiency. */
async function generateSceneClip(scene: EntertainmentScene, sceneIndex: number, outPath: string): Promise<boolean> {
  try {
    const { generateBrollVideo } = await import('./fal-video-client');
    const model = sceneIndex === 0 ? 'kling' : 'wan';  // hero=kling, rest=wan
    await generateBrollVideo(scene.visual_prompt, scene.duration_s, outPath, model as any);

    // Normalize to canonical format (two-pass for Kling/Wan format quirks)
    const norm = outPath.replace('.mp4', '_norm.mp4');
    normalizeClip(outPath, norm, scene.duration_s);
    execSync(`mv "${norm}" "${outPath}"`, { stdio: 'pipe' });
    return true;
  } catch (err: any) {
    console.warn(`    Scene ${scene.scene_id} generation failed: ${err.message?.slice(0, 80)}`);
    // Sprint 1339: Local gradient fallback — produce colored background clip instead of skipping
    try {
      const colors = ['0x1a1a2e', '0x16213e', '0x0f3460', '0x533483', '0x2d6a4f'];
      const bg = colors[sceneIndex % colors.length];
      execSync(
        `${FFMPEG} -y -f lavfi -i "color=c=${bg}:s=1080x1920:r=30" ` +
        `-t ${scene.duration_s} -c:v libx264 -preset fast -pix_fmt yuv420p "${outPath}"`,
        { stdio: 'pipe', timeout: 15000 }
      );
      if (existsSync(outPath)) {
        console.log(`    Scene ${scene.scene_id} → local gradient fallback (${bg})`);
        return true;
      }
    } catch {}
    return false;
  }
}

/** Generate natural-sounding TTS voiceover using edge-tts (Microsoft Neural voices).
 * Falls back to macOS `say` if edge-tts is unavailable. */
function generateVoiceover(script: EntertainmentScript, outDir: string): string | null {
  mkdirSync(outDir, { recursive: true });
  const parts: string[] = [];
  // Edge TTS voice: en-US-GuyNeural (natural male), en-US-JennyNeural (natural female)
  const VOICE = 'en-US-GuyNeural';

  for (const scene of script.scenes) {
    if (!scene.voiceover_text) continue;
    const mp3Path = join(outDir, `${scene.scene_id}.mp3`);
    const m4aPath = join(outDir, `${scene.scene_id}.m4a`);

    try {
      // Try edge-tts first (natural neural voice)
      const pyCode = `import asyncio, edge_tts; asyncio.run(edge_tts.Communicate(${JSON.stringify(scene.voiceover_text)}, "${VOICE}").save("${mp3Path}"))`;
      execSync(`python3 -c '${pyCode.replace(/'/g, "'\\''")}'`, { stdio: 'pipe', timeout: 20000 });
      execSync(`${FFMPEG} -y -i "${mp3Path}" -c:a aac -b:a 128k "${m4aPath}"`, { stdio: 'pipe', timeout: 10000 });
      parts.push(m4aPath);
    } catch {
      // Fallback: macOS say
      try {
        const txtPath = join(outDir, `${scene.scene_id}.txt`);
        const aiffPath = join(outDir, `${scene.scene_id}.aiff`);
        writeFileSync(txtPath, scene.voiceover_text);
        execSync(`say -v Samantha -o "${aiffPath}" -f "${txtPath}"`, { stdio: 'pipe', timeout: 15000 });
        execSync(`${FFMPEG} -y -i "${aiffPath}" -c:a aac -b:a 128k "${m4aPath}"`, { stdio: 'pipe', timeout: 10000 });
        parts.push(m4aPath);
      } catch {}
    }
  }

  if (parts.length === 0) return null;

  const listPath = join(outDir, 'concat.txt');
  writeFileSync(listPath, parts.map(p => `file '${p}'`).join('\n'));
  const fullPath = join(outDir, 'narration.m4a');
  execSync(`${FFMPEG} -y -f concat -safe 0 -i "${listPath}" -c:a aac -b:a 128k "${fullPath}"`, { stdio: 'pipe', timeout: 15000 });
  return fullPath;
}

export async function assembleEntertainmentVideo(
  script: EntertainmentScript,
  outputPath: string,
): Promise<string> {
  const runDir = join(outputPath, '..', '_assembly');
  mkdirSync(join(runDir, 'scenes'), { recursive: true });

  // 1. Generate AI video for each scene
  console.log(`  Generating ${script.scenes.length} AI video scenes...`);
  const sceneClips: Array<{ scene: EntertainmentScene; path: string }> = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const clipPath = join(runDir, 'scenes', `${scene.scene_id}.mp4`);
    console.log(`    Scene ${i + 1}/${script.scenes.length}: "${scene.visual_prompt.slice(0, 50)}..." (${scene.duration_s}s)`);

    const ok = await generateSceneClip(scene, i, clipPath);
    if (ok && existsSync(clipPath)) {
      sceneClips.push({ scene, path: clipPath });
    }
  }

  if (sceneClips.length === 0) throw new Error('All scene generations failed');
  console.log(`  ${sceneClips.length}/${script.scenes.length} scenes generated`);

  // 2. Stitch scenes — simple concat (reliable, preserves full duration)
  console.log('  Stitching scenes...');
  let stitchedPath: string;

  if (sceneClips.length === 1) {
    stitchedPath = sceneClips[0].path;
  } else {
    stitchedPath = join(runDir, 'stitched.mp4');
    const concatList = join(runDir, 'concat.txt');
    writeFileSync(concatList, sceneClips.map(c => `file '${c.path}'`).join('\n'));
    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${concatList}" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${stitchedPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log(`    Concat: ${sceneClips.length} scenes stitched`);
  }

  let currentPath = stitchedPath;

  // 3. Add voiceover if requested
  if (script.with_voiceover) {
    const narrationPath = generateVoiceover(script, join(runDir, 'tts'));
    if (narrationPath) {
      const musicPath = join(ROOT, 'workspace', 'scs001', 'music', 'lofi-chords.mp3');
      const withAudio = join(runDir, 'with_audio.mp4');

      if (script.with_music && existsSync(musicPath)) {
        execSync(
          `${FFMPEG} -y -i "${currentPath}" -i "${narrationPath}" -stream_loop -1 -i "${musicPath}" ` +
          `-filter_complex "[1:a]apad[voice];[2:a]volume=1.2[music];[voice][music]amix=inputs=2:duration=first[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${withAudio}"`,
          { stdio: 'pipe', timeout: 30000 }
        );
      } else {
        execSync(
          `${FFMPEG} -y -i "${currentPath}" -i "${narrationPath}" ` +
          `-c:v copy -c:a aac -b:a 128k -shortest "${withAudio}"`,
          { stdio: 'pipe', timeout: 30000 }
        );
      }
      currentPath = withAudio;
      console.log('    Voiceover added');
    }
  }

  // 4. Add music only (no voiceover)
  if (!script.with_voiceover || !existsSync(join(runDir, 'with_audio.mp4'))) {
    const musicPath = join(ROOT, 'workspace', 'scs001', 'music', 'lofi-chords.mp3');
    if (script.with_music && existsSync(musicPath)) {
      const withMusic = join(runDir, 'with_music.mp4');
      execSync(
        `${FFMPEG} -y -i "${currentPath}" -stream_loop -1 -i "${musicPath}" ` +
        `-filter_complex "[1:a]volume=2.5[music]" ` +
        `-map 0:v -map "[music]" -c:v copy -c:a aac -b:a 128k -shortest "${withMusic}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      currentPath = withMusic;
      console.log('    Background music added');
    } else {
      // Silent audio track
      const withSilence = join(runDir, 'with_silence.mp4');
      execSync(
        `${FFMPEG} -y -i "${currentPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
        `-c:v copy -c:a aac -b:a 128k -shortest "${withSilence}"`,
        { stdio: 'pipe', timeout: 15000 }
      );
      currentPath = withSilence;
    }
  }

  // 5. Burn captions — use Whisper timestamps if voiceover exists (synced to speech)
  console.log('  Adding captions...');
  const captionedPath = join(runDir, 'captioned.mp4');
  if (script.with_voiceover) {
    // Whisper-based: extract real word timestamps from the audio track
    burnWhisperCaptions(currentPath, captionedPath);
  } else {
    // Scene-timed fallback
    burnEntertainmentCaptions(currentPath, script, captionedPath);
  }
  if (existsSync(captionedPath)) currentPath = captionedPath;

  // 6. Add Kognai outro (Entertainment Series tagline)
  const outroPng = join(ROOT, 'assets', 'branding', 'outro-entertainment.png');
  // Generate entertainment-specific outro if it doesn't exist
  if (!existsSync(outroPng)) {
    try {
      execSync(`python3 -c "
from PIL import Image, ImageDraw, ImageFont
import math, os
W, H = 1080, 1920
bg = (26, 35, 50)
accent = (0, 210, 200)
img = Image.new('RGB', (W, H), bg)
draw = ImageDraw.Draw(img)
cx, cy = W // 2, H // 2 - 200
size = 140
for layer in range(3):
    s = size - layer * 30
    pts = [(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)]
    draw.polygon(pts, outline=accent, width=4)
    rs = int(s * 0.65)
    sq = [(int(cx + rs * math.cos(math.pi/4 + i*math.pi/2)), int(cy + rs * math.sin(math.pi/4 + i*math.pi/2))) for i in range(4)]
    draw.polygon(sq, outline=accent, width=3)
draw.ellipse([cx-15, cy-15, cx+15, cy+15], fill=accent)
for dx, dy in [(0, -size), (size, 0), (0, size), (-size, 0)]:
    draw.rectangle([cx+dx-20, cy+dy-20, cx+dx+20, cy+dy+20], fill=accent)
for dx, dy in [(size*0.7, -size*0.7), (size*0.7, size*0.7), (-size*0.7, size*0.7), (-size*0.7, -size*0.7)]:
    x, y = int(cx+dx), int(cy+dy)
    draw.polygon([(x, y-12), (x+12, y), (x, y+12), (x-12, y)], fill=accent)
tf = None
sf = None
for fp in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']:
    if os.path.exists(fp):
        try: tf = ImageFont.truetype(fp, 100); sf = ImageFont.truetype(fp, 36); break
        except: pass
ty = cy + size + 80
title = 'K O G N A I'
bb = draw.textbbox((0, 0), title, font=tf)
draw.text(((W - (bb[2]-bb[0])) // 2, ty), title, fill=(255,255,255), font=tf)
sub = 'Entertainment Series'
bb2 = draw.textbbox((0, 0), sub, font=sf)
draw.text(((W - (bb2[2]-bb2[0])) // 2, ty + 120), sub, fill=(160, 180, 200), font=sf)
draw.line([(W//2 - 90, ty + 175), (W//2 + 90, ty + 175)], fill=accent, width=3)
img.save('${outroPng.replace(/'/g, "\\'")}')
print('OK')
"`, { stdio: 'pipe', timeout: 10000 });
    } catch {}
  }
  if (existsSync(outroPng)) {
    const mainNorm = join(runDir, 'main_norm.mp4');
    execSync(
      `${FFMPEG} -y -i "${currentPath}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -ar 44100 -ac 2 "${mainNorm}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    const outroVid = join(runDir, 'outro.mp4');
    execSync(
      `${FFMPEG} -y -loop 1 -i "${outroPng}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p,fade=t=in:st=0:d=0.8" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 -t 3 "${outroVid}"`,
      { stdio: 'pipe', timeout: 15000 }
    );
    const finalList = join(runDir, 'final.txt');
    writeFileSync(finalList, `file '${mainNorm}'\nfile '${outroVid}'`);
    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${finalList}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log('    Outro added');
  } else {
    execSync(`cp "${currentPath}" "${outputPath}"`, { stdio: 'pipe' });
  }

  // Cleanup
  try { execSync(`rm -rf "${runDir}"`, { stdio: 'pipe' }); } catch {}

  const finalDur = getVideoDuration(outputPath);
  console.log(`  ✅ Entertainment video: ${finalDur.toFixed(1)}s → ${outputPath}`);
  return outputPath;
}

/** Burn Whisper-synced captions — extracts real word timestamps from audio */
function burnWhisperCaptions(videoPath: string, outputPath: string): void {
  const configPath = '/tmp/whisper_ent_config.json';
  writeFileSync(configPath, JSON.stringify({ video_path: videoPath, output_path: outputPath, ffmpeg: FFMPEG, ffprobe: FFPROBE }));

  // Reuse the same Whisper caption script from produce-vlog (writes to Python file)
  const pyPath = '/tmp/whisper_ent_captions.py';
  writeFileSync(pyPath, WHISPER_CAPTION_PY);

  try {
    const result = execSync(`python3 "${pyPath}" "${configPath}"`, { encoding: 'utf-8', timeout: 300000 });
    if (result.includes('OK')) {
      console.log(`    Whisper captions synced`);
    } else {
      execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
    }
  } catch {
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
  }
}

const WHISPER_CAPTION_PY = `
import json, subprocess, os, shutil, sys, warnings, re
warnings.filterwarnings("ignore")

config = json.load(open(sys.argv[1]))
video_path = config["video_path"]
output_path = config["output_path"]
ffmpeg = config["ffmpeg"]
ffprobe = config["ffprobe"]

frame_dir = "/tmp/whisper_ent_frames"
os.makedirs(frame_dir, exist_ok=True)

# Extract audio and run Whisper
wav = os.path.join(frame_dir, "audio.wav")
subprocess.run([ffmpeg, "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wav], capture_output=True, timeout=30)

import whisper
model = whisper.load_model("base")
result = model.transcribe(wav, word_timestamps=True, language="en")

words = []
for seg in result["segments"]:
    for w in seg.get("words", []):
        words.append({"word": w["word"].strip(), "start": w["start"], "end": w["end"]})

if not words:
    shutil.copy2(video_path, output_path)
    print("WARN no words")
    sys.exit()

# Group into chunks at punctuation
chunks = []
current = []
for w in words:
    current.append(w)
    if w["word"].endswith((".", "!", "?")) or (w["word"].endswith(",") and len(current) >= 5) or len(current) >= 10:
        chunks.append({"words": current, "start": current[0]["start"], "end": current[-1]["end"]})
        current = []
if current:
    chunks.append({"words": current, "start": current[0]["start"], "end": current[-1]["end"]})

# Probe video
info = subprocess.run([ffprobe, "-v", "quiet", "-print_format", "json", "-show_streams", "-show_entries", "format=duration", video_path], capture_output=True, text=True)
meta = json.loads(info.stdout)
W = int(meta["streams"][0].get("width", 1080))
H = int(meta["streams"][0].get("height", 1920))
fps = 30
duration = float(meta.get("format", {}).get("duration", 30))
total_frames = int(fps * duration)

from PIL import Image, ImageDraw, ImageFont
font = None
for fp in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
    if os.path.exists(fp):
        try: font = ImageFont.truetype(fp, 48); break
        except: pass
if font is None: font = ImageFont.load_default()

hl = {"fail","hype","scale","roi","investors","vaporware","customers","solutions","buzzwords","talent","companies","problems","startups","ai","real","data","users","money","replace","replacing","never","always","secret","truth","shocking","exposed","biggest","worst","best","future","agents","developers","machines","race","build","solve","million","billion","free","every","tools","deploy","click","generate","automate","save","hours","percent","jobs","startup","founder","saas","product","products","code","coding","api","sdk","software","engineer","engineers","learn","fast","faster","powerful","dangerous","broken","dead","game","changer","revolution","disruption","eliminate","destroy","growth","revenue","cost","profit","efficient","productivity","today","tomorrow","now","instantly","guaranteed","proven","behind","ahead","winning","losing","wrong","right","stop","start","dark","truth","algorithms","social","media","hidden","control","manipulation","addicted","toxic","dangerous"}

frame_map = {}
for ci, c in enumerate(chunks):
    sf = int(c["start"] * fps)
    ef = min(int(c["end"] * fps) + 1, total_frames)
    for f in range(sf, ef): frame_map[f] = ci

cache = {}
mtw = int(W * 0.9)
byb = H - 60

for fn in sorted(frame_map.keys()):
    ci = frame_map[fn]
    dst = os.path.join(frame_dir, f"f_{fn:06d}.png")
    if ci in cache: os.link(cache[ci], dst); continue

    c = chunks[ci]
    aw = [w["word"].upper() for w in c["words"]]
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    lines, cl = [], []
    for w in aw:
        test = " ".join(cl + [w])
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] - bb[0] > mtw and cl: lines.append(cl); cl = [w]
        else: cl.append(w)
    if cl: lines.append(cl)
    if len(lines) > 2: lines = lines[:2]

    lh = 60
    tth = len(lines) * lh
    bt = byb - tth - 20
    draw.rectangle([0, bt - 10, W, byb + 10], fill=(0, 0, 0, 170))

    for li, lw in enumerate(lines):
        lt = " ".join(lw)
        bb = draw.textbbox((0, 0), lt, font=font)
        lwidth = bb[2] - bb[0]
        xs = (W - lwidth) // 2
        y = bt + li * lh
        xc = xs
        for word in lw:
            clean = re.sub(r"[^a-zA-Z]", "", word).lower()
            color = (0, 200, 255, 255) if clean in hl else (255, 255, 255, 255)
            for dx in [-2,-1,0,1,2]:
                for dy in [-2,-1,0,1,2]:
                    if abs(dx)+abs(dy)>3: continue
                    draw.text((xc+dx,y+dy), word, fill=(0,0,0,255), font=font)
            draw.text((xc, y), word, fill=color, font=font)
            wbb = draw.textbbox((0, 0), word + " ", font=font)
            xc += wbb[2] - wbb[0]

    img.save(dst)
    cache[ci] = dst

# Fill gaps
empty = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ep = os.path.join(frame_dir, "_e.png")
empty.save(ep)
for i in range(total_frames):
    d = os.path.join(frame_dir, f"f_{i:06d}.png")
    if not os.path.exists(d): os.link(ep, d)

ov = os.path.join(frame_dir, "ov.mov")
subprocess.run([ffmpeg, "-y", "-framerate", str(fps), "-i", os.path.join(frame_dir, "f_%06d.png"), "-c:v", "png", "-pix_fmt", "rgba", ov], capture_output=True, timeout=180)

if os.path.exists(ov):
    r = subprocess.run([ffmpeg, "-y", "-i", video_path, "-i", ov, "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1[v]", "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", output_path], capture_output=True, timeout=300)
    if r.returncode == 0: print(f"OK chunks={len(chunks)}")
    else: shutil.copy2(video_path, output_path)
else:
    shutil.copy2(video_path, output_path)

shutil.rmtree(frame_dir, ignore_errors=True)
`;

/** Burn caption_text from scenes as subtitles using Pillow */
function burnEntertainmentCaptions(videoPath: string, script: EntertainmentScript, outputPath: string): void {
  // Build SRT-like timing from scenes
  const chunks: Array<{ text: string; start: number; end: number }> = [];
  let cursor = 0;
  for (const scene of script.scenes) {
    if (scene.caption_text) {
      chunks.push({ text: scene.caption_text, start: cursor, end: cursor + scene.duration_s });
    }
    cursor += scene.duration_s;
  }

  if (chunks.length === 0) {
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
    return;
  }

  // Write config for Python caption renderer
  const configPath = '/tmp/ent_captions_config.json';
  writeFileSync(configPath, JSON.stringify({ video_path: videoPath, output_path: outputPath, chunks, ffmpeg: FFMPEG, ffprobe: FFPROBE }));

  const pyScript = `/tmp/ent_captions.py`;
  writeFileSync(pyScript, ENT_CAPTION_PY);

  try {
    const result = execSync(`python3 "${pyScript}" "${configPath}"`, { encoding: 'utf-8', timeout: 180000 });
    if (!result.includes('OK')) {
      execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
    }
  } catch {
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
  }
}

const ENT_CAPTION_PY = `
import json, subprocess, os, shutil, sys
from PIL import Image, ImageDraw, ImageFont

config = json.load(open(sys.argv[1]))
video_path = config["video_path"]
output_path = config["output_path"]
chunks = config["chunks"]
ffmpeg = config["ffmpeg"]
ffprobe = config["ffprobe"]

info = subprocess.run([ffprobe, '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_entries', 'format=duration', video_path], capture_output=True, text=True)
meta = json.loads(info.stdout)
W = int(meta['streams'][0].get('width', 1080))
H = int(meta['streams'][0].get('height', 1920))
fps = 30
duration = float(meta.get('format', {}).get('duration', 30))
total_frames = int(fps * duration)

font = None
for fp in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']:
    if os.path.exists(fp):
        try: font = ImageFont.truetype(fp, 48); break
        except: pass
if font is None: font = ImageFont.load_default()

frame_dir = '/tmp/ent_cap_frames'
os.makedirs(frame_dir, exist_ok=True)

frame_map = {}
for ci, c in enumerate(chunks):
    sf = int(c['start'] * fps)
    ef = min(int(c['end'] * fps), total_frames)
    for f in range(sf, ef): frame_map[f] = ci

cache = {}
for fn in sorted(frame_map.keys()):
    ci = frame_map[fn]
    dst = os.path.join(frame_dir, f'f_{fn:06d}.png')
    if ci in cache: os.link(cache[ci], dst); continue

    text = chunks[ci]['text']
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    words = text.split()
    lines, cur = [], []
    mtw = int(W * 0.9)
    for w in words:
        test = ' '.join(cur + [w])
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] - bb[0] > mtw and cur: lines.append(cur); cur = [w]
        else: cur.append(w)
    if cur: lines.append(cur)
    if len(lines) > 2: lines = lines[:2]

    lh = 60
    tth = len(lines) * lh
    bt = H - 80 - tth
    draw.rectangle([0, bt - 16, W, H - 50], fill=(0, 0, 0, 170))
    for li, lw in enumerate(lines):
        lt = ' '.join(lw)
        bb = draw.textbbox((0, 0), lt, font=font)
        lwidth = bb[2] - bb[0]
        xs = (W - lwidth) // 2
        y = bt + li * lh
        for dx in [-2,-1,0,1,2]:
            for dy in [-2,-1,0,1,2]:
                if abs(dx)+abs(dy) > 3: continue
                draw.text((xs+dx, y+dy), lt, fill=(0,0,0,255), font=font)
        draw.text((xs, y), lt, fill=(255,255,255,255), font=font)

    img.save(dst)
    cache[ci] = dst

# Fill gaps
empty = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ep = os.path.join(frame_dir, '_e.png')
empty.save(ep)
for i in range(total_frames):
    d = os.path.join(frame_dir, f'f_{i:06d}.png')
    if not os.path.exists(d): os.link(ep, d)

ov = os.path.join(frame_dir, 'ov.mov')
subprocess.run([ffmpeg, '-y', '-framerate', str(fps), '-i', os.path.join(frame_dir, 'f_%06d.png'), '-c:v', 'png', '-pix_fmt', 'rgba', ov], capture_output=True, timeout=180)

if os.path.exists(ov):
    r = subprocess.run([ffmpeg, '-y', '-i', video_path, '-i', ov, '-filter_complex', '[0:v][1:v]overlay=0:0:shortest=1[v]', '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', output_path], capture_output=True, timeout=300)
    if r.returncode == 0: print(f'OK captions={len(cache)}')
    else: shutil.copy2(video_path, output_path); print('WARN')
else:
    shutil.copy2(video_path, output_path); print('WARN no overlay')

shutil.rmtree(frame_dir, ignore_errors=True)
`;
