/**
 * Scorsese Agent — SCS-001 v2 Scenario Director
 * Sprint 786 (SCS-001-V2-001)
 *
 * T3 APEX: Claude Sonnet (cloud) — creative scenario generation requires high capability.
 * Receives: TrendSignal → Produces: ScenarioBundle
 *
 * Constitutional: Hook test must prove 10M+ view format. No exceptions.
 */

import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  TrendSignal,
  ScenarioBundle,
  Scene,
  HookTest,
  VisualStyle,
  EmotionBeat,
} from '../../contracts/scs-001-v2/scenario-bundle-v1';
import { validateScenarioBundle } from '../../contracts/scs-001-v2/scenario-bundle-v1';

const ROOT = join(__dirname, '..', '..');
const PROMPT_PATH = join(__dirname, 'prompt.md');

// Model config — T3 APEX (Claude Sonnet via Anthropic API)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

interface LLMResponse {
  content: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — Scorsese requires cloud LLM');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json() as any;
  return {
    content: data.content?.[0]?.text ?? '',
    model: data.model ?? MODEL,
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
}

function loadSystemPrompt(): string {
  if (existsSync(PROMPT_PATH)) {
    return readFileSync(PROMPT_PATH, 'utf-8');
  }
  return 'You are Scorsese, a viral video scenario director. Produce ScenarioBundle JSON.';
}

function buildUserPrompt(signal: TrendSignal): string {
  return [
    'Create a ScenarioBundle for this trending topic.',
    '',
    '## TrendSignal',
    `- Topic: ${signal.topic_name}`,
    `- Confidence: ${signal.confidence_score}/100`,
    `- Keywords: ${signal.keyword_cluster.join(', ')}`,
    `- Domain: ${signal.domain_tags.join(', ')}`,
    signal.top_speakers?.length
      ? `- Top speakers: ${signal.top_speakers.map(s => s.name).join(', ')}`
      : '',
    signal.viral_examples?.length
      ? `- Viral examples: ${signal.viral_examples.join(', ')}`
      : '',
    '',
    '## Required JSON Fields',
    '- scenario_id: unique string like "scn-abc123"',
    '- title: string',
    '- angle: string (YOUR unique take/perspective on this topic — REQUIRED, NOT empty)',
    '- scenes: array of 5-6 objects, each with: scene_id, scene_name, duration_s, voiceover, visual_style, visual_description, caption_overlay, emotion, music_cue, pattern_interrupts',
    '- hook_test: { format_reference, viral_proof, why_it_works, estimated_hook_rate (number >= 30) }',
    '- speaker_name: "Kognai"',
    '- hashtags: array of strings',
    '',
    '## Rules',
    '1. 5-6 scenes, ~30 seconds total',
    '2. hook_test is MANDATORY — cite a real 10M+ view format',
    '3. First scene emotion must be exactly "curiosity" or "shock" (lowercase)',
    '4. All emotion values must be one of: curiosity, shock, intrigue, revelation, urgency, satisfaction, loop',
    '5. Min 2 pattern_interrupts (number) per scene',
    '6. visual_style: kinetic_text|react_cam|b_roll_montage|screen_recording|documentary',
    '7. music_cue: tension_build|impact_hit|ambient|upbeat|silence',
    '8. Keep voiceover strings SHORT (max 120 chars each, single line)',
    '',
    'Respond with ONLY the raw JSON object. NO markdown. NO ```json. NO text before/after.',
  ].filter(Boolean).join('\n');
}

/**
 * Extract the outermost balanced JSON object from a string.
 * Properly handles nested braces and string literals (with escaped quotes).
 */
function extractOutermostJson(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') { if (start === -1) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return text.substring(start, i + 1); }
  }
  return null;
}

/**
 * Fix unescaped newlines inside JSON string values without corrupting escaped quotes.
 */
function fixNewlinesInStrings(json: string): string {
  const out: string[] = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { out.push(ch); esc = false; continue; }
    if (ch === '\\' && inStr) { out.push(ch); esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out.push(ch); continue; }
    if (inStr && (ch === '\n' || ch === '\r')) {
      out.push('\\n');
      if (ch === '\r' && json[i + 1] === '\n') i++;
      continue;
    }
    out.push(ch);
  }
  return out.join('');
}

const VALID_EMOTIONS: EmotionBeat[] = ['curiosity', 'shock', 'intrigue', 'revelation', 'urgency', 'satisfaction', 'loop'];

function normalizeEmotion(raw: any): EmotionBeat {
  if (!raw || typeof raw !== 'string') return 'curiosity';
  const lower = raw.toLowerCase().trim();
  // Direct match
  if (VALID_EMOTIONS.includes(lower as EmotionBeat)) return lower as EmotionBeat;
  // Fuzzy match: if the raw string contains a valid emotion word, use it
  for (const e of VALID_EMOTIONS) {
    if (lower.includes(e)) return e;
  }
  return 'curiosity';
}

function parseScenarioBundle(raw: string, signal: TrendSignal, model: string): ScenarioBundle {
  console.log(`[Scorsese] Raw response length: ${raw.length} chars`);

  // Debug dump
  try {
    const dumpPath = join(process.cwd(), 'workspace', 'scs001', 'scorsese-debug-raw.txt');
    require('fs').writeFileSync(dumpPath, raw);
  } catch {}

  let json = raw.trim();

  // Strip markdown fences
  json = json.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?\s*```\s*$/gm, '');

  // Extract outermost JSON object with proper brace/string handling
  const extracted = extractOutermostJson(json);
  if (extracted) {
    json = extracted;
  } else {
    console.warn(`[Scorsese] No balanced JSON object found. Preview: ${json.substring(0, 300)}`);
  }

  let parsed: any;

  // Attempt 1: direct parse
  try {
    parsed = JSON.parse(json);
  } catch (e1: any) {
    console.warn(`[Scorsese] Parse attempt 1 failed: ${e1.message?.slice(0, 120)}`);

    // Attempt 2: fix trailing commas
    let fixed = json.replace(/,\s*([}\]])/g, '$1');
    try {
      parsed = JSON.parse(fixed);
    } catch (e2: any) {
      console.warn(`[Scorsese] Parse attempt 2 (trailing commas) failed: ${e2.message?.slice(0, 120)}`);

      // Attempt 3: fix unescaped newlines in string values
      fixed = fixNewlinesInStrings(fixed);
      try {
        parsed = JSON.parse(fixed);
      } catch (e3: any) {
        console.warn(`[Scorsese] Parse attempt 3 (newlines) failed: ${e3.message?.slice(0, 120)}`);
        console.warn(`[Scorsese] JSON preview: ${json.substring(0, 500)}`);

        // Last resort: extract fields manually
        const titleMatch = json.match(/"title"\s*:\s*"([^"]+)"/);
        const angleMatch = json.match(/"angle"\s*:\s*"([^"]+)"/);

        parsed = {
          title: titleMatch?.[1] || signal.topic_name,
          angle: angleMatch?.[1] || '',
          scenes: [],
          hook_test: {},
        };

        // Extract individual scene objects by balanced brace walking
        const scenesIdx = json.indexOf('"scenes"');
        if (scenesIdx !== -1) {
          const arrStart = json.indexOf('[', scenesIdx);
          if (arrStart !== -1) {
            let depth = 0, objStart = -1, inStr2 = false, esc2 = false;
            for (let i = arrStart + 1; i < json.length; i++) {
              const c = json[i];
              if (esc2) { esc2 = false; continue; }
              if (c === '\\' && inStr2) { esc2 = true; continue; }
              if (c === '"') { inStr2 = !inStr2; continue; }
              if (inStr2) continue;
              if (c === '{') { if (depth === 0) objStart = i; depth++; }
              else if (c === '}') { depth--; if (depth === 0 && objStart !== -1) {
                try {
                  const s = fixNewlinesInStrings(json.substring(objStart, i + 1).replace(/,\s*}/g, '}'));
                  parsed.scenes.push(JSON.parse(s));
                } catch {}
                objStart = -1;
              }}
              else if (c === ']' && depth === 0) break;
            }
          }
        }

        console.log(`[Scorsese] Partial extraction: ${parsed.scenes?.length || 0} scenes recovered`);
      }
    }
  }

  // Unwrap if Claude nested inside "scenario_bundle" or "scenario"
  if (parsed.scenario_bundle && !parsed.scenes) parsed = parsed.scenario_bundle;
  if (parsed.scenario && !parsed.scenes) parsed = parsed.scenario;

  // Map Claude's alternate field names to our schema
  const rawScenes = parsed.scenes || [];
  const hookRaw = parsed.hook_test || parsed.hook || {};

  const bundle: ScenarioBundle = {
    scenario_id: parsed.scenario_id || 'scn-' + randomUUID().substring(0, 8),
    trend_signal_id: signal.topic_id,
    title: parsed.title || parsed.topic || signal.topic_name,
    angle: parsed.angle || parsed.unique_angle || parsed.perspective || '',
    scenes: rawScenes.map((s: any, i: number) => ({
      scene_id: String(s.scene_id || `scene-${i + 1}`),
      scene_name: s.scene_name || s.label || s.name || `scene_${i + 1}`,
      duration_s: s.duration_s || s.duration_seconds || s.duration || 5,
      voiceover: s.voiceover || s.narration || s.script || '',
      visual_style: s.visual_style || 'kinetic_text',
      visual_description: s.visual_description || s.visual || s.on_screen_text || '',
      caption_overlay: s.caption_overlay || s.on_screen_text || s.text_overlay || '',
      emotion: normalizeEmotion(s.emotion),
      music_cue: (String(s.music_cue || 'ambient')).split(',')[0].trim().split(' ')[0] as any || 'ambient',
      pattern_interrupts: typeof s.pattern_interrupts === 'number' ? s.pattern_interrupts : (Array.isArray(s.pattern_interrupts) ? s.pattern_interrupts.length : 2),
    })) as Scene[],
    hook_test: {
      format_reference: hookRaw.format_reference || hookRaw.format || hookRaw.template || '',
      viral_proof: hookRaw.viral_proof || hookRaw.proof || hookRaw.evidence || '',
      why_it_works: hookRaw.why_it_works || hookRaw.mechanism || hookRaw.stop_scroll_claim || '',
      estimated_hook_rate: hookRaw.estimated_hook_rate || hookRaw.hook_rate || 40,
    } as HookTest,
    total_duration_s: 0,
    target_emotion_arc: [],
    speaker_name: parsed.speaker_name || 'Kognai',
    tts_voice: parsed.tts_voice || process.env.MIMO_TTS_VOICE || 'alloy',
    hashtags: parsed.hashtags || [],
    created_at: new Date().toISOString(),
    model_used: model,
  };

  // Compute derived fields
  bundle.total_duration_s = bundle.scenes.reduce((sum, s) => sum + s.duration_s, 0);
  bundle.target_emotion_arc = bundle.scenes.map(s => s.emotion);

  return bundle;
}

export class ScorseseAgent {
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = loadSystemPrompt();
    console.log('[Scorsese] Initialized — T3 APEX Claude Sonnet');
  }

  async direct(signal: TrendSignal): Promise<ScenarioBundle> {
    console.log(`[Scorsese] Directing scenario for: ${signal.topic_name} (confidence: ${signal.confidence_score})`);

    const userPrompt = buildUserPrompt(signal);
    const response = await callLLM(this.systemPrompt, userPrompt);

    console.log(`[Scorsese] LLM response: ${response.input_tokens} in / ${response.output_tokens} out (${response.model})`);

    const bundle = parseScenarioBundle(response.content, signal, response.model);
    const validation = validateScenarioBundle(bundle);

    if (!validation.valid) {
      console.warn(`[Scorsese] Validation errors: ${validation.errors.join('; ')}`);
      // Self-repair: trigger on any critical failure (empty scenes, bad hook_test, etc.)
      const needsRepair = bundle.scenes.length < 4 ||
        validation.errors.some(e => e.includes('hook_test') || e.includes('Missing'));
      if (needsRepair) {
        console.log(`[Scorsese] Critical failure (${bundle.scenes.length} scenes) — attempting repair...`);
        const repairPrompt = [
          'Your previous output failed JSON validation. The parsed result had these issues:',
          validation.errors.join('\n'),
          '',
          'Produce a COMPLETE ScenarioBundle with ALL required fields:',
          '- scenario_id: unique string',
          '- title: string',
          '- angle: string (the unique take on this topic)',
          '- scenes: array of 5-6 scene objects (each with scene_id, scene_name, duration_s, voiceover, visual_style, visual_description, caption_overlay, emotion, music_cue, pattern_interrupts)',
          '- hook_test: { format_reference, viral_proof, why_it_works, estimated_hook_rate (>=30) }',
          '- speaker_name: "Kognai"',
          '- hashtags: array of strings',
          '',
          `Topic: ${signal.topic_name}`,
          `Keywords: ${signal.keyword_cluster.join(', ')}`,
          '',
          'Output ONLY the raw JSON. No markdown. No text before/after.',
        ].join('\n');

        const repair = await callLLM(this.systemPrompt, repairPrompt);
        const repairedBundle = parseScenarioBundle(repair.content, signal, repair.model);
        const recheck = validateScenarioBundle(repairedBundle);

        if (recheck.valid) {
          console.log('[Scorsese] Self-repair succeeded');
          return repairedBundle;
        }
        console.warn(`[Scorsese] Self-repair still has issues: ${recheck.errors.join('; ')}`);
        return repairedBundle;
      }
    } else {
      console.log('[Scorsese] Validation PASS');
    }

    return bundle;
  }

  /**
   * Batch mode: direct multiple scenarios from a topic batch.
   */
  async directBatch(signals: TrendSignal[]): Promise<ScenarioBundle[]> {
    const results: ScenarioBundle[] = [];
    for (const signal of signals) {
      try {
        const bundle = await this.direct(signal);
        results.push(bundle);
      } catch (err) {
        console.error(`[Scorsese] Failed for "${signal.topic_name}": ${(err as Error).message}`);
      }
    }
    console.log(`[Scorsese] Batch complete: ${results.length}/${signals.length} scenarios`);
    return results;
  }
}
