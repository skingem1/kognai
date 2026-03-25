/**
 * entertainment-scriptgen.ts — LLM-powered entertainment video script generator
 *
 * Input: topic (from user or topic-radar trending)
 * Output: EntertainmentScript with 4-6 scenes, each has a visual prompt for fal.ai
 *
 * Sprint 901
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

export interface EntertainmentScene {
  scene_id: string;
  visual_prompt: string;       // for fal.ai Kling — MUST avoid text/screens/signs
  duration_s: number;          // 3-8s per scene
  voiceover_text?: string;     // optional narration
  caption_text: string;        // on-screen subtitle
  transition: 'cut' | 'fade';
}

export interface EntertainmentScript {
  script_id: string;
  topic: string;
  title: string;
  scenes: EntertainmentScene[];
  total_duration_s: number;
  with_voiceover: boolean;
  with_music: boolean;
  hashtags: string[];
}

/** Call Ollama safely */
function callOllama(prompt: string, opts?: { maxTokens?: number; temperature?: number }): string {
  let host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  if (!host.startsWith('http')) host = `http://${host}`;
  const payload = JSON.stringify({
    model: 'qwen3:14b', prompt, stream: false, think: false,
    options: { num_predict: opts?.maxTokens || 1500, temperature: opts?.temperature || 0.7 },
  });
  const tmpFile = `/tmp/ollama_ent_${Date.now()}.json`;
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
    return ''; // Ollama unreachable — caller handles empty string
  }
}

export async function generateEntertainmentScript(
  topic: string,
  opts: { withVoiceover: boolean; withMusic: boolean },
): Promise<EntertainmentScript> {
  const scriptId = `ent-${Date.now().toString(36)}`;
  console.log(`  Generating entertainment script for: "${topic}"`);

  const prompt = `Create a 30-45 second TikTok entertainment video script about: "${topic}"

The video will be entirely AI-generated (no real camera). Each scene is a separate AI video clip.

Rules:
- 4-6 scenes, each 4-8 seconds
- Total duration: 30-45 seconds
- Each scene needs a visual_prompt describing what the AI video generator should create
- CRITICAL: AI video generators CANNOT render readable text. visual_prompt must NEVER include screens, signs, documents, UI, code, charts, phones, laptops, whiteboards, or anything with text. Instead use: people, nature, cityscapes, abstract motion, technology hardware (no screens), hands, crowds, architecture, space, underwater, aerial shots.
- Each scene needs a caption_text (what appears as subtitle on screen)
- Hook scene first (attention-grabbing visual)
- Build tension/interest through middle scenes
- End with impact or call to action
${opts.withVoiceover ? '- Include voiceover_text for each scene (spoken narration)' : '- No voiceover needed'}
- Transitions: use "fade" between scenes for smooth flow, "cut" for dramatic moments

Return JSON only:
{
  "title": "catchy title under 60 chars",
  "scenes": [
    {
      "scene_id": "s1",
      "visual_prompt": "cinematic aerial shot of a futuristic city at sunset, golden light reflecting off glass buildings, flying vehicles in the distance",
      "duration_s": 5,
      ${opts.withVoiceover ? '"voiceover_text": "The future is closer than you think",' : ''}
      "caption_text": "THE FUTURE IS CLOSER THAN YOU THINK",
      "transition": "fade"
    }
  ],
  "hashtags": ["#ai", "#future", "#tech"]
}`;

  // Sprint 1328: Pre-built fallback templates — used when Ollama is unavailable or returns invalid JSON
  const SCENE_TEMPLATES: EntertainmentScript[] = [
    {
      script_id: scriptId,
      topic,
      title: 'AI Is Rewriting the Rules of Everything',
      scenes: [
        {
          scene_id: 's1',
          visual_prompt: 'cinematic aerial shot of a futuristic city at dawn, golden light reflecting off glass skyscrapers, flying drones in formation, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Artificial intelligence is moving faster than anyone predicted.' : undefined,
          caption_text: 'AI IS MOVING FASTER THAN ANYONE PREDICTED',
          transition: 'fade',
        },
        {
          scene_id: 's2',
          visual_prompt: 'close-up of a humanoid robot hand delicately assembling tiny circuit components, sparks of blue light, precise mechanical motion, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Machines now do jobs that took humans decades to master.' : undefined,
          caption_text: 'MACHINES NOW DO WHAT TOOK HUMANS DECADES',
          transition: 'cut',
        },
        {
          scene_id: 's3',
          visual_prompt: 'wide shot of a massive data center with rows of glowing blue servers stretching to the horizon, cool blue lighting, futuristic industrial atmosphere, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Billions of computations happen every second, reshaping entire industries.' : undefined,
          caption_text: 'BILLIONS OF DECISIONS MADE EVERY SECOND',
          transition: 'fade',
        },
        {
          scene_id: 's4',
          visual_prompt: 'silhouette of a person standing at a window overlooking a glowing city skyline at night, contemplative mood, city lights reflecting in the glass, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 7,
          voiceover_text: opts.withVoiceover ? 'The question is not whether AI will change your life — it already has.' : undefined,
          caption_text: 'THE FUTURE IS ALREADY HERE',
          transition: 'fade',
        },
      ],
      total_duration_s: 25,
      with_voiceover: opts.withVoiceover,
      with_music: opts.withMusic,
      hashtags: ['#ai', '#future', '#technology', '#artificialintelligence', '#trending'],
    },
    {
      script_id: scriptId,
      topic,
      title: 'The Quantum Revolution Nobody Talks About',
      scenes: [
        {
          scene_id: 's1',
          visual_prompt: 'macro shot of glowing quantum processor rings suspended in a cryogenic chamber, liquid nitrogen mist, eerie blue glow, extreme precision engineering, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Quantum computers can solve problems in seconds that would take classical computers millions of years.' : undefined,
          caption_text: 'PROBLEMS SOLVED IN SECONDS. NOT YEARS.',
          transition: 'cut',
        },
        {
          scene_id: 's2',
          visual_prompt: 'abstract visualization of quantum superposition, glowing particles in multiple states simultaneously, colorful interference patterns, wave-particle duality, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Unlike regular bits, quantum bits exist in multiple states at once.' : undefined,
          caption_text: 'EXIST IN TWO PLACES AT THE SAME TIME',
          transition: 'fade',
        },
        {
          scene_id: 's3',
          visual_prompt: 'team of scientists in clean room suits working around a large cylindrical cryogenic quantum computing device, dramatic industrial lighting, cutting-edge laboratory, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'The race to quantum supremacy will determine who controls the next century.' : undefined,
          caption_text: 'THE RACE THAT WILL SHAPE THE NEXT CENTURY',
          transition: 'cut',
        },
        {
          scene_id: 's4',
          visual_prompt: 'dramatic aerial shot of a research facility at night surrounded by mountains, lights glowing from within, sense of massive secret operation, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 7,
          voiceover_text: opts.withVoiceover ? 'The quantum revolution is already underway — and most people have no idea.' : undefined,
          caption_text: 'THE REVOLUTION HAS ALREADY STARTED',
          transition: 'fade',
        },
      ],
      total_duration_s: 25,
      with_voiceover: opts.withVoiceover,
      with_music: opts.withMusic,
      hashtags: ['#quantum', '#technology', '#science', '#future', '#computing'],
    },
    {
      script_id: scriptId,
      topic,
      title: 'We Are Going Back to Space — For Real This Time',
      scenes: [
        {
          scene_id: 's1',
          visual_prompt: 'cinematic shot of a massive rocket launching at dawn, trail of fire and smoke against a deep orange sky, slow motion, dramatic scale, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 7,
          voiceover_text: opts.withVoiceover ? 'For the first time in decades, space is becoming accessible to everyone.' : undefined,
          caption_text: 'SPACE IS FINALLY ACCESSIBLE',
          transition: 'cut',
        },
        {
          scene_id: 's2',
          visual_prompt: 'astronaut floating in the ISS cupola, looking down at Earth below, sunlight streaming in, awe-inspiring view of blue oceans and white clouds from orbit, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'Private companies are building the infrastructure to take us to the Moon, Mars, and beyond.' : undefined,
          caption_text: 'MOON. MARS. AND BEYOND.',
          transition: 'fade',
        },
        {
          scene_id: 's3',
          visual_prompt: 'futuristic Mars habitat dome on red rocky terrain, two astronauts in white spacesuits walking outside, dramatic red sky with dust haze, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'The first humans on Mars are probably already alive today.' : undefined,
          caption_text: 'THE FIRST MARS COLONISTS ARE ALIVE TODAY',
          transition: 'cut',
        },
        {
          scene_id: 's4',
          visual_prompt: 'wide shot of Earth from deep space, the planet alone in the infinite darkness, milky way visible behind it, profound and humbling cosmic perspective, no text or writing visible, photorealistic, cinematic, vertical 9:16',
          duration_s: 6,
          voiceover_text: opts.withVoiceover ? 'We are a multi-planetary species waiting to happen.' : undefined,
          caption_text: 'WE WERE BORN FOR THIS',
          transition: 'fade',
        },
      ],
      total_duration_s: 25,
      with_voiceover: opts.withVoiceover,
      with_music: opts.withMusic,
      hashtags: ['#space', '#mars', '#nasa', '#spacex', '#future', '#science'],
    },
  ];

  let scenes: EntertainmentScene[];
  let parsed: any;

  try {
    const llmResponse = callOllama(prompt, { maxTokens: 2000, temperature: 0.7 });
    const first = llmResponse.indexOf('{');
    const last = llmResponse.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('No JSON in entertainment script response');

    let jsonStr = llmResponse.substring(first, last + 1);
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    parsed = JSON.parse(jsonStr);

    scenes = (parsed.scenes || []).map((s: any, i: number) => ({
      scene_id: s.scene_id || `s${i + 1}`,
      visual_prompt: sanitizeVisualPrompt(s.visual_prompt || ''),
      duration_s: Math.max(3, Math.min(s.duration_s || 5, 8)),
      voiceover_text: opts.withVoiceover ? (s.voiceover_text || '') : undefined,
      caption_text: (s.caption_text || '').toUpperCase(),
      transition: s.transition === 'cut' ? 'cut' : 'fade',
    }));

    if (scenes.length === 0) {
      console.warn('[entertainment] LLM script gen failed — using template (0 scenes returned)');
      const tmpl = SCENE_TEMPLATES[Date.now() % SCENE_TEMPLATES.length];
      tmpl.script_id = scriptId;
      tmpl.topic = topic;
      return tmpl;
    }
  } catch (err: any) {
    console.warn(`[entertainment] LLM script gen failed — using template (${err.message})`);
    const tmpl = SCENE_TEMPLATES[Date.now() % SCENE_TEMPLATES.length];
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
    hashtags: parsed.hashtags || ['#ai', '#trending'],
  };

  console.log(`  Script: "${script.title}" — ${scenes.length} scenes, ${totalDuration}s`);
  return script;
}

/** Strip text-producing elements from visual prompts */
function sanitizeVisualPrompt(prompt: string): string {
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
