/**
 * ArtDirector Agent — SCS-001 v2 Quality Gate
 * Sprint 788 (SCS-001-V2-003)
 *
 * T2.5: Claude Haiku (cloud) — fast, cheap quality gate.
 * Receives: ScenarioBundle → Produces: ArtDirectorVerdict
 *
 * Two questions: "Does this serve the message?" + "Would a human stop scrolling?"
 * Replaces QC agent for v2 pipeline.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ScenarioBundle } from '../../contracts/scs-001-v2/scenario-bundle-v1';
import { validateScenarioBundle } from '../../contracts/scs-001-v2/scenario-bundle-v1';

const PROMPT_PATH = join(__dirname, 'prompt.md');

// Model config — T2.5 Haiku (cheap + fast)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

// ─── Types ──────────────────────────────────────────────────────────

export type Verdict = 'PASS' | 'REVISE' | 'REJECT';

export interface ArtDirectorVerdict {
  scenario_id: string;
  verdict: Verdict;
  message_score: number;        // 0-100: "Does this serve the message?"
  scroll_stop_score: number;    // 0-100: "Would a human stop scrolling?"
  message_analysis: string;
  scroll_stop_analysis: string;
  fixes: string[];              // max 3 actionable fixes (empty on PASS)
  confidence: number;           // 0-100: how sure the ArtDirector is
  model_used: string;
  reviewed_at: string;          // ISO timestamp
}

// ─── LLM Call ───────────────────────────────────────────────────────

interface LLMResponse {
  content: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

async function callHaiku(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — ArtDirector requires cloud LLM');
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

// ─── Prompt Building ────────────────────────────────────────────────

function loadSystemPrompt(): string {
  if (existsSync(PROMPT_PATH)) {
    return readFileSync(PROMPT_PATH, 'utf-8');
  }
  return 'You are ArtDirector, a quality gate for TikTok video scenarios. Answer two questions: Does this serve the message? Would a human stop scrolling? Return JSON verdict.';
}

function buildReviewPrompt(bundle: ScenarioBundle): string {
  return [
    'Review this ScenarioBundle and provide your verdict.',
    '',
    '## ScenarioBundle',
    `- Title: ${bundle.title}`,
    `- Angle: ${bundle.angle}`,
    `- Duration: ${bundle.total_duration_s}s (${bundle.scenes.length} scenes)`,
    `- Speaker: ${bundle.speaker_name}`,
    `- Emotion Arc: ${bundle.target_emotion_arc.join(' → ')}`,
    `- Hashtags: ${bundle.hashtags.join(', ')}`,
    '',
    '### Hook Test',
    `- Format: ${bundle.hook_test.format_reference}`,
    `- Proof: ${bundle.hook_test.viral_proof}`,
    `- Why: ${bundle.hook_test.why_it_works}`,
    `- Est. Hook Rate: ${bundle.hook_test.estimated_hook_rate}%`,
    '',
    '### Scenes',
    ...bundle.scenes.map((s, i) => [
      `**Scene ${i + 1}: ${s.scene_name}** (${s.duration_s}s, ${s.emotion}, ${s.visual_style})`,
      `  Voiceover: "${s.voiceover}"`,
      `  Visual: ${s.visual_description}`,
      `  Caption: "${s.caption_overlay}"`,
      `  Music: ${s.music_cue} | Pattern interrupts: ${s.pattern_interrupts}`,
    ].join('\n')),
    '',
    'Answer the two questions. Return ONLY the JSON verdict object.',
  ].join('\n');
}

// ─── Verdict Parsing ────────────────────────────────────────────────

function parseVerdict(raw: string, scenarioId: string, model: string): ArtDirectorVerdict {
  let json = raw.trim();

  // Strip markdown fences
  json = json.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?\s*```\s*$/gm, '');

  // Extract outermost JSON object (handles extra text after JSON)
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') { if (start === -1) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) { json = json.substring(start, i + 1); break; } }
  }

  // Fix trailing commas
  json = json.replace(/,\s*([}\]])/g, '$1');

  const parsed = JSON.parse(json);

  return {
    scenario_id: scenarioId,
    verdict: (['PASS', 'REVISE', 'REJECT'].includes(parsed.verdict) ? parsed.verdict : 'REJECT') as Verdict,
    message_score: Math.min(100, Math.max(0, parsed.message_score ?? 0)),
    scroll_stop_score: Math.min(100, Math.max(0, parsed.scroll_stop_score ?? 0)),
    message_analysis: parsed.message_analysis || '',
    scroll_stop_analysis: parsed.scroll_stop_analysis || '',
    fixes: Array.isArray(parsed.fixes) ? parsed.fixes.slice(0, 3) : [],
    confidence: Math.min(100, Math.max(0, parsed.confidence ?? 50)),
    model_used: model,
    reviewed_at: new Date().toISOString(),
  };
}

// ─── Pre-flight Checks ─────────────────────────────────────────────

function preflightCheck(bundle: ScenarioBundle): ArtDirectorVerdict | null {
  const validation = validateScenarioBundle(bundle);

  if (!validation.valid) {
    const critical = validation.errors.filter(e =>
      e.includes('hook_test') || e.includes('Too long') || e.includes('Missing')
    );

    if (critical.length > 0) {
      return {
        scenario_id: bundle.scenario_id,
        verdict: 'REJECT',
        message_score: 0,
        scroll_stop_score: 0,
        message_analysis: 'Failed structural validation before LLM review.',
        scroll_stop_analysis: `Validation errors: ${critical.join('; ')}`,
        fixes: critical.slice(0, 3),
        confidence: 100,
        model_used: 'preflight',
        reviewed_at: new Date().toISOString(),
      };
    }
  }

  return null; // passes preflight, proceed to LLM review
}

// ─── Agent Class ────────────────────────────────────────────────────

export class ArtDirectorAgent {
  private systemPrompt: string;

  constructor() {
    this.systemPrompt = loadSystemPrompt();
    console.log('[ArtDirector] Initialized — T2.5 Haiku quality gate');
  }

  async review(bundle: ScenarioBundle): Promise<ArtDirectorVerdict> {
    console.log(`[ArtDirector] Reviewing: "${bundle.title}" (${bundle.total_duration_s}s, ${bundle.scenes.length} scenes)`);

    // Pre-flight structural check
    const preflight = preflightCheck(bundle);
    if (preflight) {
      console.log(`[ArtDirector] REJECT (preflight): ${preflight.scroll_stop_analysis}`);
      return preflight;
    }

    // LLM review
    const userPrompt = buildReviewPrompt(bundle);
    const response = await callHaiku(this.systemPrompt, userPrompt);

    console.log(`[ArtDirector] LLM response: ${response.input_tokens} in / ${response.output_tokens} out (${response.model})`);

    const verdict = parseVerdict(response.content, bundle.scenario_id, response.model);

    console.log(`[ArtDirector] ${verdict.verdict} — message: ${verdict.message_score}/100, scroll-stop: ${verdict.scroll_stop_score}/100`);

    if (verdict.fixes.length > 0) {
      console.log(`[ArtDirector] Fixes: ${verdict.fixes.join(' | ')}`);
    }

    return verdict;
  }

  async reviewBatch(bundles: ScenarioBundle[]): Promise<ArtDirectorVerdict[]> {
    const results: ArtDirectorVerdict[] = [];
    for (const bundle of bundles) {
      try {
        const verdict = await this.review(bundle);
        results.push(verdict);
      } catch (err) {
        console.error(`[ArtDirector] Failed for "${bundle.title}": ${(err as Error).message}`);
        results.push({
          scenario_id: bundle.scenario_id,
          verdict: 'REJECT',
          message_score: 0,
          scroll_stop_score: 0,
          message_analysis: 'Review failed due to error.',
          scroll_stop_analysis: (err as Error).message,
          fixes: [],
          confidence: 0,
          model_used: 'error',
          reviewed_at: new Date().toISOString(),
        });
      }
    }
    console.log(`[ArtDirector] Batch: ${results.filter(r => r.verdict === 'PASS').length}/${results.length} PASS`);
    return results;
  }
}
