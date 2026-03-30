/**
 * bizarre-scriptgen.ts — LLM-powered script generator for Kognai Bizarre Series
 *
 * Input: topic (bizarre real fact, unusual event, or auto-selected)
 * Output: EntertainmentScript with 4-5 scenes for assembleEntertainmentVideo()
 *
 * Content focus: real bizarre facts, counterintuitive science, unusual historical
 * events, mind-bending statistics — the kind that make people say "WAIT, WHAT?!"
 *
 * Reuses EntertainmentScript interface so the P3 assembler (entertainment-assembler.ts)
 * can assemble the video with zero modifications.
 *
 * Sprint 1415 — Kognai Bizarre Series (Pipeline 4)
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import type { EntertainmentScript, EntertainmentScene } from './entertainment-scriptgen';
import { getTikTokProtocolBlock, HOOK_FORMULAS, FREYTAG_STRUCTURE, RETENTION_RULES, COMPLETION_TARGETS } from './tiktok-guide-context';

export type { EntertainmentScript, EntertainmentScene };

/** Call Ollama safely — identical to entertainment-scriptgen.ts */
function callOllama(prompt: string, opts?: { maxTokens?: number; temperature?: number }): string {
  let host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  if (!host.startsWith('http')) host = `http://${host}`;
  const payload = JSON.stringify({
    model: 'qwen3:14b', prompt, stream: false, think: false,
    options: { num_predict: opts?.maxTokens || 1500, temperature: opts?.temperature || 0.8 },
  });
  const tmpFile = `/tmp/ollama_biz_${Date.now()}.json`;
  writeFileSync(tmpFile, payload);
  try {
    const result = execSync(
      `curl -s --max-time 120 ${host}/api/generate -d @"${tmpFile}"`,
      { encoding: 'utf-8', timeout: 150000 }
    );
    try { execSync(`rm "${tmpFile}"`, { stdio: 'pipe' }); } catch {}
    return JSON.parse(result).response || '';
  } catch {
    try { execSync(`rm "${tmpFile}"`, { stdio: 'pipe' }); } catch {}
    return '';
  }
}

export async function generateBizarreScript(
  topic: string,
  opts: { withVoiceover: boolean; withMusic: boolean },
): Promise<EntertainmentScript> {
  const scriptId = `biz-${Date.now().toString(36)}`;
  console.log(`  Generating bizarre script for: "${topic}"`);

  const prompt = `You are the writer for "Kognai Bizarre Series" — a TikTok channel that only covers REAL facts and events so strange they sound fictional. Your job is to make viewers stop scrolling with genuine mind-bending truths.

CRITICAL RULE: Only use verifiable real facts. No fiction. No fabrication. The bizarre must be real.

Create a 30-45 second video about: "${topic}"

Kognai Bizarre Series formula (MANDATORY):
1. STOP-SCROLL HOOK (scene 1, 3-5s): The FIRST WORD out of the speaker's mouth IS the shocking fact — no warmup, no setup, no intro. Start mid-statement, as if the viewer walked in mid-sentence. Pattern: [SHOCKING SUBJECT] [IMPOSSIBLE VERB/FACT]. Examples: "A TEASPOON WEIGHS ONE BILLION TONS." / "CLEOPATRA NEVER SAW THE PYRAMIDS BUILT." / "THIS BUG LIVED FOR 300 MILLION YEARS." The viewer cannot scroll past in the first 2 seconds. No "This is actually real", no "Wait until you hear this", no "Fun fact" — those are BANNED.
2. THE TWIST (scenes 2-3): Layer the strangeness. Add the context that makes it even weirder. Show scale, implication, or comparison that boggles the mind.
3. THE DEEPEST PART (scene 4): The fact that most people will NEVER believe — the most extreme, counterintuitive, or overlooked element of the story.
4. THE REFRAME (scene 5, optional): End with a sentence that forces the viewer to re-evaluate something they thought they understood. "Share this" energy.

Technical rules:
- 4-5 scenes, each 4-8 seconds
- Total duration: 30-45 seconds
- visual_prompt: AI video generator — NO screens, text, signs, UI, documents, books, newspapers. Use: space nebulae, microscopic details, geological formations, ancient architecture (no inscriptions), animals, oceans, weather phenomena, crowds, human hands, industrial machinery, nature macro shots.
- caption_text: ALL CAPS, max 8 words, jaw-dropping — the thing they'll screenshot
${opts.withVoiceover ? '- voiceover_text: BANNED openers: "This is actually real", "Wait until you hear", "Nobody talks about", "Fun fact", "Did you know". Start WITH THE FACT. Lead immediately with the shocking subject. Short punchy sentences. Max 20 words per scene. The first word must be the shocking statement itself.' : '- No voiceover needed'}
- Transitions: "cut" for shocking reveals, "fade" for mind-settling moments

${FREYTAG_STRUCTURE}
${RETENTION_RULES}
${COMPLETION_TARGETS}

Return JSON only:
{
  "title": "catchy title under 60 chars",
  "scenes": [
    {
      "scene_id": "s1",
      "visual_prompt": "cinematic macro shot of glowing amber honey dripping in slow motion from ancient honeycomb, golden light, micro-detail, no text or writing visible, photorealistic, cinematic, vertical 9:16",
      "duration_s": 5,
      ${opts.withVoiceover ? '"voiceover_text": "This is actually real... and it will change how you see history.",' : ''}
      "caption_text": "3000-YEAR-OLD HONEY STILL EDIBLE",
      "transition": "cut"
    }
  ],
  "hashtags": ["#bizarre", "#mindblown", "#didyouknow"]
}`;

  // Pre-built fallback templates — used when Ollama is unavailable or returns invalid JSON
  const BIZARRE_TEMPLATES: EntertainmentScript[] = [
    {
      script_id: scriptId,
      topic,
      title: 'Cleopatra Lived Closer to the iPhone Than to the Pyramids',
      scenes: [
        {
          scene_id: 's1',
          visual_prompt: 'cinematic aerial shot of the Great Pyramid of Giza at golden hour, vast desert stretching to the horizon, ancient stones casting long shadows, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Cleopatra lived closer to the iPhone than to the Pyramids being built.' : undefined,
          caption_text: 'CLEOPATRA CLOSER TO IPHONE',
          transition: 'cut',
        },
        {
          scene_id: 's2',
          visual_prompt: 'close-up of an ancient Egyptian alabaster statue face in a dimly lit museum, dramatic side lighting, mysterious atmosphere, stone craftsmanship detail, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Cleopatra lived around 50 BC. The Great Pyramids were built around 2560 BC.' : undefined,
          caption_text: 'CLEOPATRA VS THE PYRAMIDS',
          transition: 'fade',
        },
        {
          scene_id: 's3',
          visual_prompt: 'dramatic wide shot of a futuristic city skyline at night, thousands of glowing lights reflecting in river below, cutting-edge architecture, aerial perspective, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'That means Cleopatra was closer to us — to smartphones, to the internet — than she was to the pyramids being built.' : undefined,
          caption_text: 'CLEOPATRA IS CLOSER TO US',
          transition: 'cut',
        },
        {
          scene_id: 's4',
          visual_prompt: 'abstract visualization of time flowing, glowing particles moving through a dark cosmic void, streams of light representing decades and centuries, vast scale, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 7,
          voiceover_text: opts.withVoiceover ? 'The pyramids were already 2500 years old when Cleopatra was born. History is not a line. It is a canyon.' : undefined,
          caption_text: 'HISTORY IS NOT WHAT YOU THINK',
          transition: 'fade',
        },
      ],
      total_duration_s: 25,
      with_voiceover: opts.withVoiceover,
      with_music: opts.withMusic,
      hashtags: ['#history', '#mindblown', '#bizarre', '#didyouknow', '#facts'],
    },
    {
      script_id: scriptId,
      topic,
      title: 'A Teaspoon of Neutron Star Would Weigh a Billion Tons',
      scenes: [
        {
          scene_id: 's1',
          visual_prompt: 'cinematic macro shot of a metal teaspoon resting on a plain surface, dramatic studio lighting, simple and clean composition, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 5,
          voiceover_text: opts.withVoiceover ? 'A teaspoon of neutron star weighs one billion tons on Earth.' : undefined,
          caption_text: 'ONE TEASPOON = ONE BILLION TONS',
          transition: 'cut',
        },
        {
          scene_id: 's2',
          visual_prompt: 'spectacular nebula supernova explosion in deep space, glowing plasma cloud expanding outward, purple and gold light, infinite cosmos, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'When a massive star explodes in a supernova, sometimes the core collapses into a neutron star.' : undefined,
          caption_text: 'WHEN A STAR DIES',
          transition: 'fade',
        },
        {
          scene_id: 's3',
          visual_prompt: 'dense glowing sphere of extreme energy suspended in dark space, gravitational lensing bending light around it, intense radiation halos, cosmic scale, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Neutron stars are so dense that a teaspoon of their matter would weigh approximately one billion tons on Earth.' : undefined,
          caption_text: 'ONE BILLION TONS',
          transition: 'cut',
        },
        {
          scene_id: 's4',
          visual_prompt: 'extreme close-up of human fingers holding a tiny grain of sand on a beach, ocean waves crashing in background, depth of field blur, scale comparison feel, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 7,
          voiceover_text: opts.withVoiceover ? 'The entire observable universe is mostly empty space. But in that one teaspoon of neutron star, more mass than a mountain.' : undefined,
          caption_text: 'MORE MASS THAN A MOUNTAIN',
          transition: 'fade',
        },
      ],
      total_duration_s: 24,
      with_voiceover: opts.withVoiceover,
      with_music: opts.withMusic,
      hashtags: ['#space', '#science', '#mindblown', '#bizarre', '#physics'],
    },
    {
      script_id: scriptId,
      topic,
      title: 'Honey Found in Egyptian Tombs Is Still Edible After 3,000 Years',
      scenes: [
        {
          scene_id: 's1',
          visual_prompt: 'cinematic macro shot of thick amber honey slowly dripping from a wooden honeycomb frame, golden light refracting through honey, rich color, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 5,
          voiceover_text: opts.withVoiceover ? 'Three-thousand-year-old honey found in Egyptian tombs was still perfectly edible.' : undefined,
          caption_text: '3000-YEAR-OLD HONEY STILL EDIBLE',
          transition: 'cut',
        },
        {
          scene_id: 's2',
          visual_prompt: 'dramatic shot inside an ancient stone tomb chamber, warm flickering torchlight on carved walls, golden artifacts on stone altar, dust particles in the air, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'And here is the bizarre part — they tasted it. It was still perfectly edible.' : undefined,
          caption_text: 'AND THEY TASTED IT',
          transition: 'fade',
        },
        {
          scene_id: 's3',
          visual_prompt: 'slow motion macro shot of bees working on honeycomb cells, hexagonal wax chambers glistening, close-up wing detail, soft natural light, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Honey is one of the only foods that never expires. Its chemistry — low moisture, high acidity, hydrogen peroxide — makes it inhospitable to bacteria.' : undefined,
          caption_text: 'HONEY NEVER EXPIRES',
          transition: 'cut',
        },
        {
          scene_id: 's4',
          visual_prompt: 'aerial shot of Egyptian desert landscape at dusk, ancient stone structures barely visible in fading light, vast emptiness, timeless and mysterious mood, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 7,
          voiceover_text: opts.withVoiceover ? 'Honey has been found in tombs, in shipwrecks, in sealed jars from civilizations long gone. It outlasts everything.' : undefined,
          caption_text: 'IT OUTLASTS EVERYTHING',
          transition: 'fade',
        },
      ],
      total_duration_s: 24,
      with_voiceover: opts.withVoiceover,
      with_music: opts.withMusic,
      hashtags: ['#history', '#bizarre', '#science', '#egypt', '#facts', '#mindblown'],
    },
  ];

  let scenes: EntertainmentScene[];
  let parsed: any;

  try {
    const llmResponse = callOllama(prompt, { maxTokens: 2000, temperature: 0.85 });
    const first = llmResponse.indexOf('{');
    const last = llmResponse.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('No JSON in bizarre script response');

    let jsonStr = llmResponse.substring(first, last + 1);
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    parsed = JSON.parse(jsonStr);

    scenes = (parsed.scenes || []).map((s: any, i: number) => ({
      scene_id: s.scene_id || `s${i + 1}`,
      visual_prompt: sanitizeBizarrePrompt(s.visual_prompt || ''),
      duration_s: Math.max(3, Math.min(s.duration_s || 5, 8)),
      voiceover_text: opts.withVoiceover ? (s.voiceover_text || '') : undefined,
      caption_text: (s.caption_text || '').toUpperCase(),
      transition: s.transition === 'cut' ? 'cut' : 'fade',
    }));

    if (scenes.length === 0) {
      console.warn('[bizarre] LLM script gen failed — using template (0 scenes returned)');
      const tmpl = BIZARRE_TEMPLATES[Date.now() % BIZARRE_TEMPLATES.length];
      tmpl.script_id = scriptId;
      tmpl.topic = topic;
      return tmpl;
    }
  } catch (err: any) {
    console.warn(`[bizarre] LLM script gen failed — using template (${err.message})`);
    const tmpl = BIZARRE_TEMPLATES[Date.now() % BIZARRE_TEMPLATES.length];
    tmpl.script_id = scriptId;
    tmpl.topic = topic;
    return tmpl;
  }

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration_s, 0);

  const script: EntertainmentScript = {
    script_id: scriptId,
    topic,
    title: parsed.title || topic,
    scenes,
    total_duration_s: totalDuration,
    with_voiceover: opts.withVoiceover,
    with_music: opts.withMusic,
    hashtags: parsed.hashtags || ['#bizarre', '#mindblown', '#didyouknow'],
  };

  console.log(`  Script: "${script.title}" — ${scenes.length} scenes, ${totalDuration}s`);
  return script;
}

/** Strip text-producing elements from visual prompts — mirrors entertainment-scriptgen.ts */
function sanitizeBizarrePrompt(prompt: string): string {
  const textPatterns = [
    /\b(showing|displaying|with)\s+(text|words|title|headline|caption|label|sign|banner)/gi,
    /\b(screen|monitor|laptop|phone|tablet|display)\s+(showing|with|displaying)/gi,
    /\b(whiteboard|chalkboard|document|paper|book|newspaper)\b/gi,
    /\b(graph|chart|dashboard)\s+(showing|with|labeled)/gi,
    /\bUI\b|\binterface\b|\bmenu\b/gi,
  ];
  let cleaned = prompt;
  for (const pat of textPatterns) cleaned = cleaned.replace(pat, '');
  if (!cleaned.includes('no text')) {
    cleaned = cleaned.trim() + ', no text or writing visible, photorealistic, cinematic, vertical 9:16';
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}
