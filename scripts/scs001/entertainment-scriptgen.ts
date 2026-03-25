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
  const result = execSync(
    `curl -s --max-time 120 ${host}/api/generate -d @"${tmpFile}"`,
    { encoding: 'utf-8', timeout: 150000 }
  );
  try { execSync(`rm "${tmpFile}"`, { stdio: 'pipe' }); } catch {}
  return JSON.parse(result).response || '';
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

  const llmResponse = callOllama(prompt, { maxTokens: 2000, temperature: 0.7 });
  const first = llmResponse.indexOf('{');
  const last = llmResponse.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('No JSON in entertainment script response');

  let jsonStr = llmResponse.substring(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(jsonStr);

  const scenes: EntertainmentScene[] = (parsed.scenes || []).map((s: any, i: number) => ({
    scene_id: s.scene_id || `s${i + 1}`,
    visual_prompt: sanitizeVisualPrompt(s.visual_prompt || ''),
    duration_s: Math.max(3, Math.min(s.duration_s || 5, 8)),
    voiceover_text: opts.withVoiceover ? (s.voiceover_text || '') : undefined,
    caption_text: (s.caption_text || '').toUpperCase(),
    transition: s.transition === 'cut' ? 'cut' : 'fade',
  }));

  if (scenes.length === 0) throw new Error('LLM generated 0 scenes');

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
