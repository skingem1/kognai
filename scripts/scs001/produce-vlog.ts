/**
 * produce-vlog.ts — Single-presenter vlog video producer
 *
 * Architecture: Avatar is the BACKBONE (continuous audio + video).
 * B-roll overlays replace the VIDEO ONLY at cutaway timestamps —
 * avatar voice plays uninterrupted underneath.
 *
 * Pipeline:
 *   1. LLM writes script (qwen3:14b)
 *   2. Captions.ai generates avatar video (voice + lip-sync)
 *   3. fal.ai Kling generates B-roll clips
 *   4. FFmpeg overlays B-roll on avatar video (audio stays continuous)
 *   5. Pillow renders TikTok-style subtitles (bold, 3-word, pill bg, yellow highlight)
 *   6. Kognai outro-frame.png appended
 *   7. Avatar creator rotates across runs
 *
 * Usage: npx ts-node scripts/scs001/produce-vlog.ts --topic "Your topic here"
 *
 * Sprint 869 v2 fixes:
 *   - B-roll: overlay filter (avatar audio stays continuous, no cut)
 *   - Audio: single stream — no segment boundaries, no glitch
 *   - Outro: force scale+pad to exact 1080x1920, re-encode both to match
 *   - Subtitles: TikTok style — 3-word chunks, 64pt bold, rounded pill bg, yellow highlight
 *   - Creator: rotate across AVATAR_CREATORS per run
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const WORKSPACE = join(ROOT, 'workspace', 'scs001');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

// ── Avatar creator rotation ──────────────────────────

const AVATAR_CREATORS = ['Jason', 'Kate', 'Jake', 'Kira', 'Luke', 'Selene', 'Ethan', 'Liam'];
const CREATOR_STATE_PATH = join(WORKSPACE, '.creator-rotation.json');

function getNextCreator(): string {
  if (process.env.CAPTIONS_CREATOR) return process.env.CAPTIONS_CREATOR;

  let idx = 0;
  try {
    const state = JSON.parse(readFileSync(CREATOR_STATE_PATH, 'utf-8'));
    idx = ((state.lastIndex ?? -1) + 1) % AVATAR_CREATORS.length;
  } catch {}

  const creator = AVATAR_CREATORS[idx];
  try {
    writeFileSync(CREATOR_STATE_PATH, JSON.stringify({ lastIndex: idx, creator, updatedAt: new Date().toISOString() }));
  } catch {}

  return creator;
}

// ── Types ────────────────────────────────────────────

interface VlogScript {
  title: string;
  full_monologue: string;
  broll_cutaways: Array<{
    timestamp_s: number;
    duration_s: number;
    visual_prompt: string;
  }>;
  hashtags: string[];
}

// ── Helpers ──────────────────────────────────────────

function getVideoDuration(videoPath: string): number {
  const raw = execSync(
    `${FFPROBE} -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    { encoding: 'utf-8' }
  ).trim();
  return parseFloat(raw) || 0;
}

/** Re-encode video to canonical 1080x1920 30fps h264/aac */
function normalizeVideo(input: string, output: string, opts?: { noAudio?: boolean; duration?: number }): void {
  const audioFlag = opts?.noAudio ? '-an' : '-c:a aac -b:a 128k -ar 44100 -ac 2';
  const durationFlag = opts?.duration ? `-t ${opts.duration}` : '';
  execSync(
    `${FFMPEG} -y -i "${input}" ` +
    `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30" ` +
    `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ${audioFlag} ${durationFlag} "${output}"`,
    { stdio: 'pipe', timeout: 60000 }
  );
}

/** Strip text-producing elements from B-roll prompts. AI video models hallucinate gibberish text. */
function sanitizeBrollPrompt(prompt: string): string {
  // Remove phrases that would produce unreadable text
  const textPatterns = [
    /\b(showing|displaying|with)\s+(text|words|title|headline|caption|label|sign|banner|subtitle)/gi,
    /\b(screen|monitor|laptop|phone|tablet|display)\s+(showing|with|displaying)/gi,
    /\b(whiteboard|chalkboard|document|paper|book|newspaper|article)\s+(with|showing|reading)/gi,
    /\b(graph|chart|dashboard)\s+(showing|with|labeled|displaying)/gi,
    /\bcode\s+(on|showing|displayed)/gi,
    /\b(stock|price|ticker)\s+(graph|chart|showing)/gi,
    /\bUI\b|\binterface\b/gi,
  ];
  let cleaned = prompt;
  for (const pat of textPatterns) {
    cleaned = cleaned.replace(pat, '');
  }
  // Append a no-text instruction for the video model
  if (!cleaned.includes('no text')) {
    cleaned = cleaned.trim() + ', no text or writing visible, photorealistic, cinematic';
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

// ── Step 1: Write the script with LLM ────────────────

async function writeScript(topic: string): Promise<VlogScript> {
  console.log('📝 Writing vlog script...');

  const prompt = `Write a 30-second TikTok vlog script about: "${topic}"

Rules:
- One presenter speaking directly to camera (like a podcast host)
- Full monologue must be UNDER 750 characters
- Bold hook in first sentence. No "hey guys."
- Video structure: Avatar shows for 6s (hook) → B-roll for 6s → Avatar for 6s (middle) → B-roll for 6s → Avatar for 6s (closing/CTA) → outro
- Total: ~30 seconds. Avatar visible for 18s, B-roll for 12s
- Exactly 2 B-roll cutaways: first at timestamp 6s (duration 6s), second at 18s (duration 6s)
- B-roll visual_prompt MUST be directly relevant to the topic being discussed at that moment
- CRITICAL: AI video generators CANNOT render readable text. NEVER include screens, signs, documents, UI, code, charts, phones, laptops, whiteboards. Instead: people, nature, cityscapes, objects, abstract motion, hands, crowds, architecture, technology hardware (no screens).
- End with a question to drive comments

Return JSON only:
{
  "title": "catchy title under 60 chars",
  "full_monologue": "everything the presenter says, under 750 chars, one paragraph, no newlines",
  "broll_cutaways": [
    {"timestamp_s": 6, "duration_s": 6, "visual_prompt": "visual directly related to what is being said at this moment"},
    {"timestamp_s": 18, "duration_s": 6, "visual_prompt": "visual directly related to what is being said at this moment"}
  ],
  "hashtags": ["#ai", "#tech", "#coding"]
}`;

  let host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  if (!host.startsWith('http')) host = `http://${host}`;
  // Write payload to file to avoid shell escaping issues with quotes in the prompt
  const payloadFile = `/tmp/vlog_ollama_${Date.now()}.json`;
  writeFileSync(payloadFile, JSON.stringify({
    model: 'qwen3:14b',
    prompt,
    stream: false,
    think: false,
    options: { num_predict: 1000, temperature: 0.7 },
  }));
  const result = execSync(
    `curl -s --max-time 180 ${host}/api/generate -d @"${payloadFile}"`,
    { encoding: 'utf-8', timeout: 200000 }
  );
  try { execSync(`rm -f "${payloadFile}"`, { stdio: 'pipe' }); } catch {}

  const llmResponse = JSON.parse(result).response || '';
  const first = llmResponse.indexOf('{');
  const last = llmResponse.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('No JSON in LLM response');

  let jsonStr = llmResponse.substring(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  const script = JSON.parse(jsonStr) as VlogScript;

  if (script.full_monologue.length > 800) {
    script.full_monologue = script.full_monologue.slice(0, 797) + '...';
  }

  if (script.broll_cutaways) {
    script.broll_cutaways.sort((a, b) => a.timestamp_s - b.timestamp_s);
    for (const cut of script.broll_cutaways) {
      cut.duration_s = Math.max(3, Math.min(cut.duration_s, 8));
      // Sanitize: strip text-producing elements from visual prompts
      // AI video generators hallucinate gibberish text on screens/signs
      cut.visual_prompt = sanitizeBrollPrompt(cut.visual_prompt);
    }
  }

  console.log(`  Title: "${script.title}"`);
  console.log(`  Monologue: ${script.full_monologue.length} chars`);
  console.log(`  B-roll cutaways: ${script.broll_cutaways?.length || 0}`);

  return script;
}

// ── Step 2: Generate avatar video (HeyGen API) ─────
//
// HeyGen: text script + avatar ID + voice ID → lip-synced avatar video
// ~3.5 min per video, 1287 avatars, built-in TTS
// API: https://api.heygen.com/v2/video/generate
// Env: HEYGEN_API_KEY

// HeyGen avatars — portrait expressive + dark brand background (#1a2332)
// Rotated via .creator-rotation.json — different avatar each run
const HEYGEN_AVATAR_POOL: Array<{ avatarId: string; voiceId: string; gender: string; name: string }> = [
  { name: 'Abigail', avatarId: 'Abigail_expressive_2024112501', voiceId: 'M2WosQ2Ju3f2b7jdddsj', gender: 'female' },
  { name: 'Adriana BizTalk', avatarId: 'Adriana_BizTalk_Front_public', voiceId: 'M2WosQ2Ju3f2b7jdddsj', gender: 'female' },
  { name: 'Adriana Business', avatarId: 'Adriana_Business_Front_2_public', voiceId: 'M2WosQ2Ju3f2b7jdddsj', gender: 'female' },
  { name: 'Aditya Blazer', avatarId: 'Aditya_public_4', voiceId: 'a50b2b18a4bf49109caf46a3a6c6a08a', gender: 'male' },
  { name: 'Adrian Blue', avatarId: 'Adrian_public_3_20240312', voiceId: '2eca0d3dd5ec4a1ea6efa6194b19eb78', gender: 'male' },
  { name: 'Adrian Suit', avatarId: 'Adrian_public_2_20240312', voiceId: 'a50b2b18a4bf49109caf46a3a6c6a08a', gender: 'male' },
  { name: 'Ann Business', avatarId: 'Ann_Business_Sitting_public', voiceId: 'M2WosQ2Ju3f2b7jdddsj', gender: 'female' },
  { name: 'Aditya Tshirt', avatarId: 'Aditya_public_2', voiceId: '3ae75279043648ce8f96310333c9288f', gender: 'male' },
];

async function generateAvatar(monologue: string, outPath: string, creator: string): Promise<void> {
  const apiKey = process.env.HEYGEN_API_KEY || '';
  if (!apiKey) throw new Error('HEYGEN_API_KEY not set in .env');

  // Rotate through avatar pool using the creator rotation index
  let poolIdx = 0;
  try {
    const state = JSON.parse(readFileSync(CREATOR_STATE_PATH, 'utf-8'));
    poolIdx = (state.lastIndex ?? 0) % HEYGEN_AVATAR_POOL.length;
  } catch {}
  const avatarInfo = HEYGEN_AVATAR_POOL[poolIdx];
  console.log(`🎤 Generating avatar (HeyGen, ${creator} → ${avatarInfo.avatarId}, ${avatarInfo.gender} voice)...`);

  // 1. Submit to HeyGen (dark Kognai brand background)
  const payload = JSON.stringify({
    video_inputs: [{
      character: { type: 'avatar', avatar_id: avatarInfo.avatarId, avatar_style: 'normal' },
      voice: { type: 'text', input_text: monologue, voice_id: avatarInfo.voiceId },
      background: { type: 'color', value: '#1a2332' },
    }],
    dimension: { width: 1080, height: 1920 },
  });
  const tmpPayload = '/tmp/heygen_payload.json';
  writeFileSync(tmpPayload, payload);

  const submitResult = execSync(
    `curl -s -X POST "https://api.heygen.com/v2/video/generate" ` +
    `-H "x-api-key: ${apiKey}" -H "Content-Type: application/json" -d @"${tmpPayload}"`,
    { encoding: 'utf-8', timeout: 30000 }
  );
  const submitData = JSON.parse(submitResult);
  const videoId = submitData.data?.video_id;
  if (!videoId) throw new Error(`HeyGen submit failed: ${JSON.stringify(submitData).slice(0, 200)}`);
  console.log(`  Job ${videoId} submitted`);

  // 2. Poll until completed (max 15 minutes)
  const maxWait = 900000;
  const startPoll = Date.now();
  while (Date.now() - startPoll < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const pollResult = execSync(
      `curl -s "https://api.heygen.com/v1/video_status.get?video_id=${videoId}" -H "x-api-key: ${apiKey}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const pollData = JSON.parse(pollResult);
    const status = pollData.data?.status;

    if (status === 'completed') {
      const videoUrl = pollData.data?.video_url;
      if (!videoUrl) throw new Error('HeyGen: no video_url in completed response');
      console.log('  Downloading video...');
      execSync(`curl -sL "${videoUrl}" -o "${outPath}"`, { timeout: 60000 });
      break;
    }
    if (status === 'failed') {
      throw new Error(`HeyGen job FAILED: ${JSON.stringify(pollData.data?.error || 'unknown').slice(0, 200)}`);
    }
    console.log(`  [HeyGen] ${status}...`);
  }

  if (!existsSync(outPath)) throw new Error('HeyGen: video download failed or timed out');

  // 3. Normalize to 1080x1920
  const scaled = outPath.replace('.mp4', '_scaled.mp4');
  normalizeVideo(outPath, scaled);
  execSync(`mv "${scaled}" "${outPath}"`, { stdio: 'pipe' });

  // Cleanup
  try { execSync(`rm -f "${tmpPayload}"`, { stdio: 'pipe' }); } catch {}

  console.log(`  ✅ Avatar: ${outPath}`);
}

// ── Step 2b: TTS fallback (ElevenLabs voiceover + dark background) ──

async function generateTTSBackbone(monologue: string, outPath: string): Promise<void> {
  console.log(`🎤 Generating TTS backbone (ElevenLabs + gradient bg)...`);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = process.env.TTS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah
  const modelId = process.env.TTS_MODEL_ID || 'eleven_flash_v2_5';

  // 1. Generate voiceover audio
  const audioPath = outPath.replace('.mp4', '_tts.mp3');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: monologue,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  writeFileSync(audioPath, Buffer.from(await res.arrayBuffer()));

  // 2. Get audio duration
  const duration = parseFloat(
    execSync(`${FFPROBE} -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`, { encoding: 'utf-8' }).trim()
  ) || 30;

  // 3. Generate dark gradient background video matching audio length
  execSync(
    `${FFMPEG} -y -f lavfi -i "color=c=0x0a0a1a:s=1080x1920:d=${duration + 1},format=yuv420p,fps=30" ` +
    `-i "${audioPath}" ` +
    `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 128k -ar 44100 -ac 2 ` +
    `-shortest "${outPath}"`,
    { stdio: 'pipe', timeout: 60000 }
  );

  const finalDur = getVideoDuration(outPath);
  console.log(`  ✅ TTS backbone: ${finalDur.toFixed(1)}s (ElevenLabs + dark bg)`);

  // Cleanup temp audio
  try { execSync(`rm -f "${audioPath}"`, { stdio: 'pipe' }); } catch {}
}

// ── Step 3: Generate B-roll (FLUX images + Ken Burns zoom) ────
//
// Uses FLUX/schnell on fal.ai ($0.03/image) instead of Kling ($0.42/5s video).
// Each image gets a slow Ken Burns zoompan effect via FFmpeg to create motion.
// Cost: ~$0.06 for 2 B-roll clips (93% cheaper than video).

async function generateBroll(
  cutaways: VlogScript['broll_cutaways'],
  outDir: string,
): Promise<Array<{ path: string; timestamp_s: number; duration_s: number }>> {
  console.log(`🎬 Generating ${cutaways.length} B-roll images (FLUX + Ken Burns)...`);

  const results: Array<{ path: string; timestamp_s: number; duration_s: number }> = [];

  for (let i = 0; i < cutaways.length; i++) {
    const cut = cutaways[i];
    const imgPath = join(outDir, `broll_${i}.png`);
    const outPath = join(outDir, `broll_${i}.mp4`);

    try {
      // 1. Generate image with FLUX/schnell
      const falKey = process.env.FAL_KEY || '';
      const pyScript = `/tmp/flux_broll_${Date.now()}.py`;
      writeFileSync(pyScript, `
import fal_client, os, json, subprocess
os.environ["FAL_KEY"] = ${JSON.stringify(falKey)}
result = fal_client.subscribe("fal-ai/flux/schnell", arguments={
    "prompt": ${JSON.stringify(cut.visual_prompt + ', cinematic lighting, photorealistic, vertical 9:16, no text or writing visible')},
    "image_size": {"width": 1080, "height": 1920},
    "num_images": 1,
})
url = result.get("images", [{}])[0].get("url", "")
if url:
    subprocess.run(["curl", "-sL", url, "-o", ${JSON.stringify(imgPath)}], capture_output=True)
    print("OK")
else:
    print("FAIL")
`);
      const fluxResult = execSync(`python3 "${pyScript}"`, { encoding: 'utf-8', timeout: 60000 });
      try { execSync(`rm -f "${pyScript}"`, { stdio: 'pipe' }); } catch {}

      if (!fluxResult.includes('OK') || !existsSync(imgPath)) {
        console.warn(`  ❌ B-roll ${i} FLUX failed`);
        continue;
      }

      // 2. Convert image to video with Ken Burns zoompan effect
      // Slow zoom in from 100% to 115% over the clip duration
      execSync(
        `${FFMPEG} -y -loop 1 -i "${imgPath}" ` +
        `-vf "zoompan=z='min(zoom+0.0005,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${cut.duration_s * 30}:s=1080x1920:fps=30" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -t ${cut.duration_s} "${outPath}"`,
        { stdio: 'pipe', timeout: 30000 }
      );

      // No need to normalize — already 1080x1920 from zoompan

      results.push({ path: outPath, timestamp_s: cut.timestamp_s, duration_s: cut.duration_s });
      console.log(`  ✅ B-roll ${i}: ${cut.visual_prompt.slice(0, 40)}... (${cut.duration_s}s at ${cut.timestamp_s}s)`);
    } catch (err: any) {
      console.warn(`  ❌ B-roll ${i} failed: ${err.message?.slice(0, 80)}`);
    }
  }

  return results;
}

// ── Step 4: Overlay B-roll on avatar (audio stays continuous) ─

function compositeVideo(
  avatarPath: string,
  brollClips: Array<{ path: string; timestamp_s: number; duration_s: number }>,
  outputPath: string,
): void {
  console.log('🎞️  Compositing: overlay B-roll on avatar (audio continuous)...');

  if (brollClips.length === 0) {
    execSync(`cp "${avatarPath}" "${outputPath}"`, { stdio: 'pipe' });
    console.log('  (No B-roll — avatar only)');
    return;
  }

  // Strategy: avatar is the base (video + audio). B-roll clips overlay the VIDEO
  // only at specific timestamps. Avatar audio plays uninterrupted throughout.
  //
  // FFmpeg filter chain:
  //   [1:v] setpts + fade → [broll0]
  //   [0:v][broll0] overlay enable=between(t,5,8) → [v0]
  //   [2:v] setpts + fade → [broll1]
  //   [v0][broll1] overlay enable=between(t,15,18) → [vout]
  //   map [vout] + map 0:a (avatar audio intact)

  const inputs = [`-i "${avatarPath}"`];
  for (const clip of brollClips) inputs.push(`-i "${clip.path}"`);

  const filterParts: string[] = [];
  let prevLabel = '0:v';

  for (let i = 0; i < brollClips.length; i++) {
    const clip = brollClips[i];
    const startS = clip.timestamp_s;
    const endS = startS + clip.duration_s;
    const outLabel = i === brollClips.length - 1 ? 'vout' : `v${i}`;
    // Reset B-roll PTS so it starts from 0, no alpha fade (hard cut = fully opaque)
    filterParts.push(
      `[${i + 1}:v]setpts=PTS-STARTPTS[broll${i}]`
    );
    // Overlay fully opaque on top of avatar at the exact timestamp
    // format=auto ensures pixel format compatibility
    filterParts.push(
      `[${prevLabel}][broll${i}]overlay=0:0:format=auto:enable='between(t\\,${startS}\\,${endS})'[${outLabel}]`
    );
    prevLabel = outLabel;
  }

  const filterComplex = filterParts.join('; ');

  try {
    execSync(
      `${FFMPEG} -y ${inputs.join(' ')} ` +
      `-filter_complex "${filterComplex}" ` +
      `-map "[vout]" -map 0:a ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 128k "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );
    console.log(`  ✅ Composited: ${brollClips.length} B-roll overlays on avatar`);
  } catch (err: any) {
    console.warn(`  ❌ Overlay failed: ${(err as Error).message?.slice(0, 120)}`);
    // Fallback: avatar only (no B-roll)
    execSync(`cp "${avatarPath}" "${outputPath}"`, { stdio: 'pipe' });
    console.log('  (Fallback: avatar only)');
  }
}

// ── Step 5: TikTok-style subtitles (Whisper + Pillow) ─
//
// Uses OpenAI Whisper to extract real word timestamps from the avatar audio,
// then renders TikTok-style captions with Pillow:
// - Full sentences (2 lines max), timed to actual speech
// - White bold uppercase text with black outline
// - Keywords highlighted in cyan
// - Dark semi-transparent background bar (full width)

function addSubtitles(videoPath: string, _monologue: string, outputPath: string): void {
  console.log('📝 Adding TikTok subtitles (Whisper timestamps)...');

  const totalDuration = getVideoDuration(videoPath);
  if (totalDuration <= 0) {
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
    return;
  }

  const frameDir = `/tmp/vlog_subs_${Date.now()}`;

  // Single Python script: Whisper transcribe → group into chunks → render frames → overlay
  const pyScript = `
import subprocess, os, shutil, json, warnings
warnings.filterwarnings("ignore")

video_path = ${JSON.stringify(videoPath)}
output_path = ${JSON.stringify(outputPath)}
frame_dir = ${JSON.stringify(frameDir)}
ffmpeg = ${JSON.stringify(FFMPEG)}
ffprobe = ${JSON.stringify(FFPROBE)}

os.makedirs(frame_dir, exist_ok=True)

# ── 1. Extract audio and run Whisper ──
wav_path = os.path.join(frame_dir, 'audio.wav')
subprocess.run([ffmpeg, '-y', '-i', video_path, '-vn', '-acodec', 'pcm_s16le',
                '-ar', '16000', '-ac', '1', wav_path], capture_output=True, timeout=30)

import whisper
model = whisper.load_model("base")
result = model.transcribe(wav_path, word_timestamps=True, language="en")

words = []
for seg in result["segments"]:
    for w in seg.get("words", []):
        words.append({"word": w["word"].strip(), "start": w["start"], "end": w["end"]})

if not words:
    shutil.copy2(video_path, output_path)
    print("WARN whisper found no words")
    exit()

# ── 2. Group words into display chunks at punctuation boundaries ──
chunks = []  # [{words: [{word, start, end}], start, end}]
current = []
for w in words:
    current.append(w)
    txt = w["word"]
    # Break at sentence-ending punct or after 8+ words or comma after 5+
    if txt.endswith(('.', '!', '?')) or (txt.endswith(',') and len(current) >= 5) or len(current) >= 10:
        chunks.append({"words": current, "start": current[0]["start"], "end": current[-1]["end"]})
        current = []
if current:
    chunks.append({"words": current, "start": current[0]["start"], "end": current[-1]["end"]})

print(f"Whisper: {len(words)} words, {len(chunks)} chunks")

# ── 3. Probe video dimensions ──
info = subprocess.run([ffprobe, '-v', 'quiet', '-print_format', 'json',
    '-show_streams', '-show_entries', 'format=duration', video_path], capture_output=True, text=True)
meta = json.loads(info.stdout)
W = int(meta['streams'][0].get('width', 1080))
H = int(meta['streams'][0].get('height', 1920))
fps = 30
duration = float(meta.get('format', {}).get('duration', 30))
total_frames = int(fps * duration)

# ── 4. Load font ──
from PIL import Image, ImageDraw, ImageFont
font = None
for fp in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf',
           '/Library/Fonts/Arial Bold.ttf',
           '/System/Library/Fonts/Helvetica.ttc']:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 52)
            break
        except:
            pass
if font is None:
    font = ImageFont.load_default()

highlight_set = {'fail','hype','scale','roi','investors','vaporware','customers',
    'solutions','buzzwords','talent','companies','problems','startups','ai',
    'real','data','users','money','replace','replacing','never','always',
    'secret','truth','shocking','exposed','biggest','worst','best','future',
    'agents','developers','machines','race','build','solve','million','billion',
    'free','every','tools','deploy','click','generate','automate','save',
    'hours','percent','jobs','startup','founder','saas','product','products',
    'code','coding','api','sdk','software','engineer','engineers',
    'learn','fast','faster','powerful','dangerous','broken','dead',
    'game','changer','revolution','disruption','eliminate','destroy',
    'growth','revenue','cost','profit','efficient','productivity',
    'today','tomorrow','now','instantly','guaranteed','proven',
    'behind','ahead','winning','losing','wrong','right','stop','start'}

# ── 5. Build frame→chunk map and render ──
frame_map = {}
for ci, chunk in enumerate(chunks):
    sf = int(chunk['start'] * fps)
    ef = min(int(chunk['end'] * fps) + 1, total_frames)
    for f in range(sf, ef):
        frame_map[f] = ci

render_cache = {}
rendered = 0
max_text_w = int(W * 0.92)
bar_y_bottom = H - 60

for fn in sorted(frame_map.keys()):
    ci = frame_map[fn]
    cache_key = str(ci)
    dst = os.path.join(frame_dir, f'f_{fn:06d}.png')
    if cache_key in render_cache:
        os.link(render_cache[cache_key], dst)
        continue

    chunk = chunks[ci]
    all_words = [w['word'].upper() for w in chunk['words']]

    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Word-wrap into max 2 lines
    lines = []
    cur_line = []
    for w in all_words:
        test = ' '.join(cur_line + [w])
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] - bb[0] > max_text_w and cur_line:
            lines.append(cur_line)
            cur_line = [w]
        else:
            cur_line.append(w)
    if cur_line:
        lines.append(cur_line)
    if len(lines) > 2:
        lines = lines[:2]

    line_height = 65
    total_text_h = len(lines) * line_height
    bar_top = bar_y_bottom - total_text_h - 24
    bar_bot = bar_y_bottom + 16
    draw.rectangle([0, bar_top, W, bar_bot], fill=(0, 0, 0, 170))

    for li, line_words in enumerate(lines):
        line_text = ' '.join(line_words)
        bb = draw.textbbox((0, 0), line_text, font=font)
        line_w = bb[2] - bb[0]
        x_start = (W - line_w) // 2
        y = bar_top + 12 + li * line_height
        x_cursor = x_start
        for word in line_words:
            clean = word.lower().rstrip('.,!?;:\\'')
            is_hl = clean in highlight_set
            color = (0, 200, 255, 255) if is_hl else (255, 255, 255, 255)
            for dx in [-2, -1, 0, 1, 2]:
                for dy in [-2, -1, 0, 1, 2]:
                    if abs(dx) + abs(dy) > 3:
                        continue
                    draw.text((x_cursor+dx, y+dy), word, fill=(0, 0, 0, 255), font=font)
            draw.text((x_cursor, y), word, fill=color, font=font)
            wbb = draw.textbbox((0, 0), word + ' ', font=font)
            x_cursor += wbb[2] - wbb[0]

    img.save(dst)
    render_cache[cache_key] = dst
    rendered += 1

# ── 6. Fill gaps with empty transparent frames (FFmpeg needs consecutive numbering) ──
empty_img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
empty_path = os.path.join(frame_dir, '_empty.png')
empty_img.save(empty_path)
filled = 0
for i in range(total_frames):
    dst = os.path.join(frame_dir, f'f_{i:06d}.png')
    if not os.path.exists(dst):
        os.link(empty_path, dst)
        filled += 1
print(f'Filled {filled} gap frames')

# ── 7. Create overlay video and composite ──
if rendered == 0:
    shutil.copy2(video_path, output_path)
    print("WARN no frames rendered")
else:
    overlay = os.path.join(frame_dir, 'overlay.mov')
    r1 = subprocess.run([ffmpeg, '-y', '-framerate', str(fps),
        '-i', os.path.join(frame_dir, 'f_%06d.png'),
        '-c:v', 'png', '-pix_fmt', 'rgba', overlay], capture_output=True, timeout=180)

    if os.path.exists(overlay) and r1.returncode == 0:
        r2 = subprocess.run([ffmpeg, '-y', '-i', video_path, '-i', overlay,
            '-filter_complex', '[0:v][1:v]overlay=0:0:shortest=1[v]',
            '-map', '[v]', '-map', '0:a?',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', output_path], capture_output=True, timeout=300)
        if r2.returncode == 0:
            print(f'OK rendered={rendered} chunks={len(chunks)}')
        else:
            shutil.copy2(video_path, output_path)
            print(f'WARN composite failed')
    else:
        shutil.copy2(video_path, output_path)
        print(f'WARN overlay failed')

shutil.rmtree(frame_dir, ignore_errors=True)
`;

  try {
    const tmpPy = '/tmp/vlog_subs.py';
    writeFileSync(tmpPy, pyScript);
    const result = execSync(`python3 "${tmpPy}"`, { encoding: 'utf-8', timeout: 300000 });
    if (result.includes('OK')) {
      const match = result.match(/rendered=(\d+)\s+chunks=(\d+)/);
      console.log(`  ✅ Subtitles burned (${match?.[2] || '?'} chunks, ${match?.[1] || '?'} unique frames)`);
    } else {
      console.warn(`  ⚠️ Subtitles: ${result.trim().slice(0, 100)}`);
    }
  } catch (err: any) {
    console.warn(`  ❌ Subtitles failed: ${err.message?.slice(0, 80)}`);
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
  }
}

// ── Step 6: Kognai outro ─────────────────────────────

function addOutro(videoPath: string, outputPath: string): void {
  console.log('🎬 Adding Kognai outro...');

  const outroPng = join(ROOT, 'assets', 'branding', 'outro-frame.png');
  if (!existsSync(outroPng)) {
    console.warn('  ⚠️ outro-frame.png not found, skipping outro');
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
    return;
  }

  const tmpDir = '/tmp/vlog_outro_' + Date.now();
  mkdirSync(tmpDir, { recursive: true });

  try {
    // Re-encode main video to strict canonical format
    const mainNorm = join(tmpDir, 'main.mp4');
    execSync(
      `${FFMPEG} -y -i "${videoPath}" ` +
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 128k -ar 44100 -ac 2 "${mainNorm}"`,
      { stdio: 'pipe', timeout: 60000 }
    );

    // Generate 3-second outro from PNG
    // IMPORTANT: scale+pad to exact same resolution, force yuv420p (PNG is RGB)
    const outroVid = join(tmpDir, 'outro.mp4');
    execSync(
      `${FFMPEG} -y -loop 1 -i "${outroPng}" ` +
      `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p,fade=t=in:st=0:d=0.8" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 128k -ar 44100 -ac 2 ` +
      `-t 3 "${outroVid}"`,
      { stdio: 'pipe', timeout: 15000 }
    );

    // Verify both files exist and have valid duration
    const mainDur = getVideoDuration(mainNorm);
    const outroDur = getVideoDuration(outroVid);
    if (mainDur <= 0 || outroDur <= 0) {
      throw new Error(`Invalid durations: main=${mainDur}s outro=${outroDur}s`);
    }

    // Concat with re-encode (safest — avoids any codec param mismatch)
    const concatList = join(tmpDir, 'concat.txt');
    writeFileSync(concatList, `file '${mainNorm}'\nfile '${outroVid}'`);

    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${concatList}" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 128k -ar 44100 -ac 2 "${outputPath}"`,
      { stdio: 'pipe', timeout: 60000 }
    );

    const finalDur = getVideoDuration(outputPath);
    console.log(`  ✅ Outro added (${outroDur.toFixed(1)}s, total ${finalDur.toFixed(1)}s)`);
  } catch (err: any) {
    console.warn(`  ❌ Outro failed: ${err.message?.slice(0, 120)}`);
    execSync(`cp "${videoPath}" "${outputPath}"`, { stdio: 'pipe' });
  } finally {
    try { execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' }); } catch {}
  }
}

// ── Main ─────────────────────────────────────────────

async function produceVlog(topic: string, mode: 'avatar' | 'tts' = 'avatar'): Promise<string> {
  const runId = `vlog-${Date.now().toString(36)}`;
  const runDir = join(WORKSPACE, 'vlog-runs', runId);
  mkdirSync(join(runDir, 'broll'), { recursive: true });

  const creator = mode === 'avatar' ? getNextCreator() : 'TTS';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Vlog Producer — ${runId}`);
  console.log(`Topic: ${topic}`);
  console.log(`Mode: ${mode}${mode === 'avatar' ? ` (Avatar: ${creator})` : ' (ElevenLabs)'}`);
  console.log(`${'='.repeat(50)}\n`);

  const startTime = Date.now();

  // 1. Write script
  const script = await writeScript(topic);
  writeFileSync(join(runDir, 'script.json'), JSON.stringify(script, null, 2));

  // 2. Generate backbone video (avatar or TTS)
  const avatarPath = join(runDir, 'avatar.mp4');
  if (mode === 'tts') {
    await generateTTSBackbone(script.full_monologue, avatarPath);
  } else {
    await generateAvatar(script.full_monologue, avatarPath, creator);
  }

  // 3. Generate B-roll cutaways
  const brollClips = await generateBroll(script.broll_cutaways || [], join(runDir, 'broll'));

  // 4. Overlay B-roll on avatar (audio stays continuous — no cut)
  const compositedPath = join(runDir, 'composited.mp4');
  compositeVideo(avatarPath, brollClips, compositedPath);

  // 5. Add TikTok subtitles
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
  console.log(`   Avatar: ${creator}`);
  console.log(`   Hashtags: ${script.hashtags?.join(' ') || 'none'}`);
  console.log(`${'='.repeat(50)}\n`);

  writeFileSync(join(runDir, 'meta.json'), JSON.stringify({
    runId, topic, creator, mode,
    title: script.title,
    hashtags: script.hashtags,
    broll_count: brollClips.length,
    elapsed_s: parseInt(elapsed),
    produced_at: new Date().toISOString(),
  }, null, 2));

  const dlDir = `/Users/tarekmnif/Downloads/kognai-avatar-test`;
  try {
    mkdirSync(dlDir, { recursive: true });
    execSync(`cp "${finalPath}" "${dlDir}/${runId}.mp4"`, { stdio: 'pipe' });
  } catch {}

  return finalPath;
}

// ── CLI ──────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let topic = 'AI agents are replacing junior developers';
  let mode: 'avatar' | 'tts' = 'avatar';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) topic = args[++i];
    else if (args[i].startsWith('--topic=')) topic = args[i].split('=').slice(1).join('=');
    else if (args[i] === '--mode' && args[i + 1]) mode = args[++i] as any;
    else if (args[i].startsWith('--mode=')) mode = args[i].split('=')[1] as any;
    else if (!args[i].startsWith('--')) topic = args[i];
  }

  produceVlog(topic, mode).then(path => {
    console.log(`Output: ${path}`);
    try { execSync(`open "${path}"`); } catch {}
  }).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

export { produceVlog };
