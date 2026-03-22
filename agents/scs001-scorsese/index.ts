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
    '## Requirements',
    '1. Output ONLY valid JSON matching the ScenarioBundle schema',
    '2. 5-7 scenes, 24-60 seconds total',
    '3. Hook test is MANDATORY — cite a real format that gets 10M+ views',
    '4. First scene emotion must be "curiosity" or "shock"',
    '5. Min 2 pattern_interrupts per scene',
    '6. Include hashtags (5-8 niche + 2-3 broad)',
    '',
    'Respond with ONLY the JSON object, no markdown fences, no explanation.',
  ].filter(Boolean).join('\n');
}

function parseScenarioBundle(raw: string, signal: TrendSignal, model: string): ScenarioBundle {
  // Strip markdown fences if present
  let json = raw.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(json);

  // Ensure required fields
  const bundle: ScenarioBundle = {
    scenario_id: parsed.scenario_id || 'scn-' + randomUUID().substring(0, 8),
    trend_signal_id: signal.topic_id,
    title: parsed.title || signal.topic_name,
    angle: parsed.angle || '',
    scenes: (parsed.scenes || []).map((s: any, i: number) => ({
      scene_id: s.scene_id || `scene-${i + 1}`,
      scene_name: s.scene_name || `scene_${i + 1}`,
      duration_s: s.duration_s || 5,
      voiceover: s.voiceover || '',
      visual_style: s.visual_style || 'kinetic_text',
      visual_description: s.visual_description || '',
      caption_overlay: s.caption_overlay || '',
      emotion: s.emotion || 'curiosity',
      music_cue: s.music_cue || 'ambient',
      pattern_interrupts: s.pattern_interrupts || 2,
    })) as Scene[],
    hook_test: {
      format_reference: parsed.hook_test?.format_reference || '',
      viral_proof: parsed.hook_test?.viral_proof || '',
      why_it_works: parsed.hook_test?.why_it_works || '',
      estimated_hook_rate: parsed.hook_test?.estimated_hook_rate || 0,
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
      console.warn(`[Scorsese] Validation warnings: ${validation.errors.join('; ')}`);
      // Attempt self-repair on first failure
      if (validation.errors.some(e => e.includes('hook_test'))) {
        console.log('[Scorsese] Hook test failed — attempting repair...');
        const repairPrompt = [
          'The scenario you produced failed validation:',
          validation.errors.join('\n'),
          '',
          'Fix the issues and return the corrected ScenarioBundle JSON.',
          'CRITICAL: hook_test is constitutional — it MUST have format_reference, why_it_works, and estimated_hook_rate >= 30.',
          '',
          'Original scenario:',
          JSON.stringify(bundle, null, 2),
        ].join('\n');

        const repair = await callLLM(this.systemPrompt, repairPrompt);
        const repairedBundle = parseScenarioBundle(repair.content, signal, repair.model);
        const recheck = validateScenarioBundle(repairedBundle);

        if (recheck.valid) {
          console.log('[Scorsese] Self-repair succeeded');
          return repairedBundle;
        }
        console.warn(`[Scorsese] Self-repair still has issues: ${recheck.errors.join('; ')}`);
        return repairedBundle; // Return anyway, ArtDirector will catch issues
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
