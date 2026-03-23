/**
 * produce-vlog.ts — Single-presenter vlog video producer
 *
 * Architecture: Avatar is the BACKBONE. B-roll are brief cutaway overlays.
 * - Captions.ai generates the full avatar video (voice + lip-sync)
 * - Kling generates 2-3 short B-roll clips
 * - FFmpeg overlays B-roll onto avatar at specific timestamps
 * - No macOS `say` — Captions.ai IS the voice
 *
 * Usage: npx ts-node scripts/scs001/produce-vlog.ts --topic "Your topic here"
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const WORKSPACE = join(ROOT, 'workspace', 'scs001');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

interface VlogScript {
  title: string;
  full_monologue: string;       // Everything the presenter says (max 800 chars for Captions.ai)
  broll_cutaways: Array<{
    timestamp_s: number;         // When to cut to B-roll
    duration_s: number;          // How long the cutaway lasts (2-4s)
    visual_prompt: string;       // What Kling should generate
  }>;
  hashtags: string[];
}

// ── Step 1: Write the script with LLM ─────────────────

async function writeScript(topic: string): Promise<VlogScript> {
  console.log('📝 Writing vlog script...');

  const prompt = `Write a 30-second TikTok vlog script about: "${topic}"

Rules:
- One presenter speaking directly to camera (like a podcast host)
- Full monologue must be UNDER 750 characters (Captions.ai limit)
- Bold hook in first sentence. No "hey guys."
- 2-3 moments where we cut to B-roll (visual examples of what presenter is saying)
- End with a question to drive comments

Return JSON only:
{
  "title": "catchy title under 60 chars",
  "full_monologue": "everything the presenter says, under 750 chars, one paragraph, no newlines",
  "broll_cutaways": [
    {"timestamp_s": 5, "duration_s": 3, "visual_prompt": "what to show visually"},
    {"timestamp_s": 15, "duration_s": 3, "visual_prompt": "what to show visually"}
  ],
  "hashtags": ["#ai", "#tech", "#coding"]
}`;

  // Use Ollama qwen3:14b for script (free, fast)
  const result = execSync(
    `curl -s --max-time 60 http://localhost:11434/api/generate -d '${JSON.stringify({
      model: 'qwen3:14b',
      prompt,
      stream: false,
      think: false,
      options: { num_predict: 1000, temperature: 0.7 },
    }).replace(/'/g, "'\\''")}'`,
    { encoding: 'utf-8', timeout: 90000 }
  );

  const llmResponse = JSON.parse(result).response || '';

  // Extract JSON
  const first = llmResponse.indexOf('{');
  const last = llmResponse.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('No JSON in LLM response');

  let jsonStr = llmResponse.substring(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1'); // fix trailing commas

  const script = JSON.parse(jsonStr) as VlogScript;

  // Enforce 800 char limit
  if (script.full_monologue.length > 800) {
    script.full_monologue = script.full_monologue.slice(0, 797) + '...';
  }

  console.log(`  Title: "${script.title}"`);
  console.log(`  Monologue: ${script.full_monologue.length} chars`);
  console.log(`  B-roll cutaways: ${script.broll_cutaways?.length || 0}`);

  return script;
}

// ── Step 2: Generate avatar video (Captions.ai) ───────

async function generateAvatar(monologue: string, outPath: string): Promise<void> {
  console.log('🎤 Generating avatar (Captions.ai)...');

  const { generateAvatarVideo } = await import('./avatar-presenter');
  await generateAvatarVideo(monologue, outPath, process.env.CAPTIONS_CREATOR || 'Jason', 300000);

  // Scale to 1080x1920
  const scaled = outPath.replace('.mp4', '_scaled.mp4');
  execSync(
    `${FFMPEG} -y -i "${outPath}" ` +
    `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30" ` +
    `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k "${scaled}"`,
    { stdio: 'pipe', timeout: 30000 }
  );
  execSync(`mv "${scaled}" "${outPath}"`, { stdio: 'pipe' });
  console.log(`  ✅ Avatar: ${outPath}`);
}

// ── Step 3: Generate B-roll clips (fal.ai Kling) ──────

async function generateBroll(
  cutaways: VlogScript['broll_cutaways'],
  outDir: string,
): Promise<Array<{ path: string; timestamp_s: number; duration_s: number }>> {
  console.log(`🎬 Generating ${cutaways.length} B-roll cutaways...`);

  const { generateBrollVideo } = await import('./fal-video-client');
  const results: Array<{ path: string; timestamp_s: number; duration_s: number }> = [];

  for (let i = 0; i < cutaways.length; i++) {
    const cut = cutaways[i];
    const outPath = join(outDir, `broll_${i}.mp4`);
    try {
      await generateBrollVideo(cut.visual_prompt, cut.duration_s, outPath, 'kling');

      // Normalize to 1080x1920
      const norm = outPath.replace('.mp4', '_norm.mp4');
      execSync(
        `${FFMPEG} -y -i "${outPath}" ` +
        `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -t ${cut.duration_s} "${norm}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      execSync(`mv "${norm}" "${outPath}"`, { stdio: 'pipe' });

      results.push({ path: outPath, timestamp_s: cut.timestamp_s, duration_s: cut.duration_s });
      console.log(`  ✅ B-roll ${i}: ${cut.visual_prompt.slice(0, 40)}... (${cut.duration_s}s at ${cut.timestamp_s}s)`);
    } catch (err: any) {
      console.warn(`  ❌ B-roll ${i} failed: ${err.message?.slice(0, 80)}`);
    }
  }

  return results;
}

// ── Step 4: Composite — avatar base + B-roll overlays ─

function compositeVideo(
  avatarPath: string,
  brollClips: Array<{ path: string; timestamp_s: number; duration_s: number }>,
  outputPath: string,
): void {
  console.log('🎞️  Compositing: avatar + B-roll overlays...');

  if (brollClips.length === 0) {
    execSync(`cp "${avatarPath}" "${outputPath}"`, { stdio: 'pipe' });
    console.log('  (No B-roll — avatar only)');
    return;
  }

  // Re-encode each B-roll to match avatar format exactly (fixes black screen issue)
  const normClips: typeof brollClips = [];
  for (let i = 0; i < brollClips.length; i++) {
    const clip = brollClips[i];
    const normPath = clip.path.replace('.mp4', '_match.mp4');
    try {
      execSync(
        `${FFMPEG} -y -i "${clip.path}" ` +
        `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -t ${clip.duration_s} "${normPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      normClips.push({ ...clip, path: normPath });
    } catch {
      console.warn(`  ⚠️ B-roll ${i} normalize failed, skipping`);
    }
  }

  // Build FFmpeg overlay filter chain
  const inputs = [`-i "${avatarPath}"`];
  for (const clip of normClips) inputs.push(`-i "${clip.path}"`);

  let filterParts: string[] = [];
  let prevLabel = '0:v';

  for (let i = 0; i < normClips.length; i++) {
    const clip = normClips[i];
    const startS = clip.timestamp_s;
    const endS = startS + clip.duration_s;
    const outLabel = i === normClips.length - 1 ? 'vout' : `v${i}`;

    filterParts.push(
      `[${i + 1}:v]setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=${Math.max(0, clip.duration_s - 0.4)}:d=0.4:alpha=1[broll${i}]`
    );
    filterParts.push(
      `[${prevLabel}][broll${i}]overlay=0:0:enable='between(t\\,${startS}\\,${endS})'[${outLabel}]`
    );
    prevLabel = outLabel;
  }

  const filterComplex = filterParts.join('; ');

  try {
    execSync(
      `${FFMPEG} -y ${inputs.join(' ')} ` +
      `-filter_complex "${filterComplex}" ` +
      `-map "[vout]" -map 0:a? -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log(`  ✅ Composited: ${outputPath}`);
  } catch (err: any) {
    console.warn(`  ❌ Composite failed: ${(err as Error).message?.slice(0, 120)}`);
    execSync(`cp "${avatarPath}" "${outputPath}"`, { stdio: 'pipe' });
    console.log('  (Fallback: avatar only)');
  }
}

// ── Step 5: Dynamic subtitles (TikTok style) ─────────

function addSubtitles(videoPath: string, monologue: string, outputPath: string): void {
  console.log('📝 Adding dynamic subtitles...');

  // Generate SRT from monologue — split into ~4-6 word chunks
  const words = monologue.replace(/\*\*/g, '').split(/\s+/);
  const chunks: Array<{ text: string; start: number; end: number }> = [];
  const wordsPerChunk = 5;
  const totalDuration = parseFloat(
    execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`, { encoding: 'utf-8' }).trim()
  );
  const timePerWord = totalDuration / words.length;

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    const start = i * timePerWord;
    const end = Math.min((i + wordsPerChunk) * timePerWord, totalDuration);
    chunks.push({ text: chunk, start, end });
  }

  // Write SRT file
  const srtPath = videoPath.replace('.mp4', '.srt');
  const srtContent = chunks.map((c, i) => {
    const fmtTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`;
  }).join('\n');
  writeFileSync(srtPath, srtContent);

  // Burn subtitles using Python Pillow (same approach as burn-captions.ts)
  // TikTok style: centered, white text, black outline, large font
  try {
    const pyScript = `
import json, subprocess, os
from PIL import Image, ImageDraw, ImageFont

srt_path = ${JSON.stringify(srtPath)}
video_path = ${JSON.stringify(videoPath)}
output_path = ${JSON.stringify(outputPath)}

# Parse SRT
chunks = []
with open(srt_path) as f:
    blocks = f.read().strip().split('\\n\\n')
    for block in blocks:
        lines = block.strip().split('\\n')
        if len(lines) >= 3:
            times = lines[1].split(' --> ')
            def parse_t(t):
                h, m, rest = t.split(':')
                s, ms = rest.split(',')
                return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000
            chunks.append({
                'text': ' '.join(lines[2:]),
                'start': parse_t(times[0]),
                'end': parse_t(times[1])
            })

# Get video info
info = subprocess.run(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', video_path], capture_output=True, text=True)
streams = json.loads(info.stdout)['streams']
W = int(streams[0]['width'])
H = int(streams[0]['height'])
fps = 30
duration = float(streams[0].get('duration', 30))
total_frames = int(fps * duration)

# Generate subtitle overlay frames
frame_dir = '/tmp/sub_frames'
os.makedirs(frame_dir, exist_ok=True)

try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 48)
except:
    font = ImageFont.load_default()

for f in range(total_frames):
    t = f / fps
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for chunk in chunks:
        if chunk['start'] <= t < chunk['end']:
            text = chunk['text'].upper()
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            x = (W - tw) // 2
            y = H - 300
            # Black outline
            for dx in [-2, -1, 0, 1, 2]:
                for dy in [-2, -1, 0, 1, 2]:
                    draw.text((x+dx, y+dy), text, fill=(0, 0, 0, 255), font=font)
            # White text
            draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
            break

    img.save(f'{frame_dir}/f_{f:05d}.png')

# Overlay subtitle frames onto video
subprocess.run([
    '/opt/homebrew/bin/ffmpeg', '-y',
    '-i', video_path,
    '-framerate', str(fps),
    '-i', f'{frame_dir}/f_%05d.png',
    '-filter_complex', '[0:v][1:v]overlay=0:0:shortest=1[v]',
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '128k',
    output_path
], capture_output=True, timeout=120)

import shutil
shutil.rmtree(frame_dir, ignore_errors=True)
print('OK')
`;
    const tmpPy = '/tmp/add_subs.py';
    writeFileSync(tmpPy, pyScript);
    const result = execSync(`python3 "${tmpPy}"`, { encoding: 'utf-8', timeout: 180000 });
    if (result.trim() === 'OK') {
      console.log('  ✅ Subtitles burned in');
    }
  } catch (err: any) {
    console.warn(`  ❌ Subtitles failed: ${err.message?.slice(0, 80)}`);
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
  }
}

// ── Step 6: Kognai outro ──────────────────────────────

function addOutro(videoPath: string, outputPath: string): void {
  console.log('🎬 Adding Kognai outro...');

  const outroPng = join(ROOT, 'assets', 'branding', 'outro-frame.png');
  if (!existsSync(outroPng)) {
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
    return;
  }

  // Generate 3-second outro video from the PNG with fade-in
  const outroVid = '/tmp/kognai_outro.mp4';
  try {
    execSync(
      `${FFMPEG} -y -loop 1 -i "${outroPng}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
      `-vf "fps=30,fade=t=in:st=0:d=0.8" -c:v libx264 -pix_fmt yuv420p -c:a aac -t 3 "${outroVid}"`,
      { stdio: 'pipe', timeout: 15000 }
    );

    // Concat main video + outro
    const listPath = '/tmp/outro_concat.txt';
    writeFileSync(listPath, `file '${videoPath}'\nfile '${outroVid}'`);
    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${outputPath}"`,
      { stdio: 'pipe', timeout: 30000 }
    );
    console.log('  ✅ Outro added (3s fade)');
  } catch (err: any) {
    console.warn(`  ❌ Outro failed: ${err.message?.slice(0, 80)}`);
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
  }
}

// ── Main ──────────────────────────────────────────────

async function produceVlog(topic: string): Promise<string> {
  const runId = `vlog-${Date.now().toString(36)}`;
  const runDir = join(WORKSPACE, 'vlog-runs', runId);
  mkdirSync(join(runDir, 'broll'), { recursive: true });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Vlog Producer — ${runId}`);
  console.log(`Topic: ${topic}`);
  console.log(`${'='.repeat(50)}\n`);

  const startTime = Date.now();

  // 1. Write script
  const script = await writeScript(topic);
  writeFileSync(join(runDir, 'script.json'), JSON.stringify(script, null, 2));

  // 2. Generate avatar (the backbone)
  const avatarPath = join(runDir, 'avatar.mp4');
  await generateAvatar(script.full_monologue, avatarPath);

  // 3. Generate B-roll cutaways
  const brollClips = await generateBroll(script.broll_cutaways || [], join(runDir, 'broll'));

  // 4. Composite avatar + B-roll overlays
  const compositedPath = join(runDir, 'composited.mp4');
  compositeVideo(avatarPath, brollClips, compositedPath);

  // 5. Add dynamic subtitles (TikTok style)
  const subtitledPath = join(runDir, 'subtitled.mp4');
  addSubtitles(compositedPath, script.full_monologue, subtitledPath);

  // 6. Add Kognai outro
  const finalPath = join(runDir, `${runId}.mp4`);
  addOutro(subtitledPath, finalPath);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Vlog complete: ${finalPath}`);
  console.log(`   Duration: ${elapsed}s production time`);
  console.log(`   Title: "${script.title}"`);
  console.log(`   Hashtags: ${script.hashtags?.join(' ') || 'none'}`);
  console.log(`${'='.repeat(50)}\n`);

  // Save to Downloads for easy viewing
  const dlPath = `/Users/tarekmnif/Downloads/kognai-avatar-test/${runId}.mp4`;
  try { execSync(`cp "${finalPath}" "${dlPath}"`, { stdio: 'pipe' }); } catch {}

  return finalPath;
}

// ── CLI ───────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let topic = 'AI agents are replacing junior developers';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) topic = args[++i];
    else if (args[i].startsWith('--topic=')) topic = args[i].split('=').slice(1).join('=');
    else if (!args[i].startsWith('--')) topic = args[i];
  }

  produceVlog(topic).then(path => {
    console.log(`Output: ${path}`);
    try { execSync(`open "${path}"`); } catch {}
  }).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

export { produceVlog };
