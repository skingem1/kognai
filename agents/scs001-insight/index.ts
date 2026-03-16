// SCS-001 — Insight Agent (Agent 4)
// Consumes: ClipQualityScore[] (qualified === true only) from Clip Detection Agent
// Produces: InsightBrief[] (per contracts/scs-001/insight-brief-v1.json)
// Model: Claude Sonnet via ClawRouter — constitutional layer
// Block B: operates on mock qualified clips

import { randomUUID } from 'crypto';
import type { ClipQualityScore } from '../scs001-clip-detection/index';

export interface InsightBrief {
  insight_id:           string;
  clip_id:              string;
  hook:                 { text: string; formula: 'curiosity_gap' | 'contrarian' | 'authority' | 'secret' };
  pre_clip_commentary:  string;
  post_clip_commentary: string;
  insight_statement:    string;
  why_does_this_matter: string;
  hook_formula_used:    string;
  speaker_name:         string;
  cloud_cost_usd:       number;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const CLAUDE_MODEL      = 'claude-sonnet-4-5-20251001';

// Mock qualified clips for Block B testing (quality_score >= 20, qualified === true)
export function getMockQualifiedClips(): ClipQualityScore[] {
  return [
    {
      clip_id:                 'clip-mock-001',
      discovery_id:            'disc-mock-001',
      url:                     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start_seconds:           0,
      end_seconds:             15,
      duration_seconds:        15,
      quality_score:           22,
      score_breakdown:         { curiosity: 5, emotion: 4, clarity: 5, insight: 4, controversy: 4 },
      phrase_triggers_matched: ['this changes everything'],
      speaker:                 'Sam Altman',
      topic_tags:              ['AI', 'AGI', 'OpenAI', 'future of work'],
      qualified:               true,
    },
    {
      clip_id:                 'clip-mock-002',
      discovery_id:            'disc-mock-002',
      url:                     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start_seconds:           120,
      end_seconds:             135,
      duration_seconds:        15,
      quality_score:           21,
      score_breakdown:         { curiosity: 4, emotion: 4, clarity: 4, insight: 5, controversy: 4 },
      phrase_triggers_matched: ['nobody is talking about'],
      speaker:                 'Jensen Huang',
      topic_tags:              ['GPU', 'AI infrastructure', 'compute scarcity'],
      qualified:               true,
    },
  ];
}

function buildPrompt(clip: ClipQualityScore): string {
  const scores   = clip.score_breakdown;
  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const triggers = clip.phrase_triggers_matched.join(', ') || 'none';

  return [
    'You are an expert TikTok content strategist. Generate an InsightBrief for this qualified clip.',
    '',
    'CLIP DATA:',
    'Speaker: ' + clip.speaker,
    'Topics: ' + clip.topic_tags.join(', '),
    'Window: ' + clip.start_seconds + 's to ' + clip.end_seconds + 's (' + clip.duration_seconds + 's)',
    'Score: ' + clip.quality_score + '/25 | Dominant factor: ' + dominant + ' (' + scores[dominant as keyof typeof scores] + '/5)',
    'Phrase triggers: ' + triggers,
    '',
    'HOOK FORMULA GUIDE (pick the best fit):',
    '  curiosity_gap  — viewer wants to know what happens next (use when curiosity is highest)',
    '  contrarian     — challenges mainstream belief (use when controversy is highest)',
    '  authority      — expert reveals what others miss (use when insight is highest)',
    '  secret         — story nobody is telling (use when controversy + phrase triggers present)',
    '',
    'CRITICAL RULE: why_does_this_matter must explain a SPECIFIC real-world implication.',
    'Generic phrases like "This is interesting" or "This matters" are REJECTED.',
    '',
    'Respond with ONLY a JSON object — no markdown, no explanation:',
    'Required keys: hook_text (string, max 80 chars), hook_formula (curiosity_gap|contrarian|authority|secret),',
    'pre_clip_commentary (string, max 200 chars), post_clip_commentary (string, max 200 chars),',
    'insight_statement (string, max 200 chars), why_does_this_matter (string, 20-500 chars, SPECIFIC),',
    'hook_formula_used (string)',
  ].join('\n');
}

export class InsightAgent {
  async run(clips: ClipQualityScore[]): Promise<InsightBrief[]> {
    const qualified = clips.filter(c => c.qualified);
    console.log('[InsightAgent] ' + clips.length + ' clips in → ' + qualified.length + ' qualified');

    const briefs: InsightBrief[] = [];
    for (const clip of qualified) {
      try {
        const brief = await this.generateBrief(clip);
        briefs.push(brief);
        console.log('[InsightAgent] ✓ ' + clip.clip_id + ' → formula: ' + brief.hook.formula);
      } catch (err) {
        console.warn('[InsightAgent] ✗ ' + clip.clip_id + ' failed: ' + (err as Error).message);
      }
    }
    console.log('[InsightAgent] ' + briefs.length + '/' + qualified.length + ' insights generated');
    return briefs;
  }

  private async generateBrief(clip: ClipQualityScore): Promise<InsightBrief> {
    const prompt = buildPrompt(clip);

    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'x-api-key':        ANTHROPIC_API_KEY,
        'anthropic-version':'2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        messages:   [{ role: 'user', content: prompt }],
        max_tokens: 512,
      }),
    });

    if (!res.ok) {
      throw new Error('Anthropic API ' + res.status + ': ' + (await res.text()).substring(0, 80));
    }

    const json = await res.json() as {
      content: Array<{ type: string; text: string }>;
      usage?:  { input_tokens?: number; output_tokens?: number };
    };

    const content = json.content?.find(b => b.type === 'text')?.text ?? '';
    const tokens  = (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);
    // Claude Sonnet blended cost estimate (~$9 per 1M tokens)
    const costUsd = (tokens / 1_000_000) * 9;

    // Extract JSON object from response
    const start = content.indexOf('{');
    const end   = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON object in response: ' + content.substring(0, 120));
    }
    const p = JSON.parse(content.slice(start, end + 1)) as {
      hook_text:             string;
      hook_formula:          InsightBrief['hook']['formula'];
      pre_clip_commentary:   string;
      post_clip_commentary:  string;
      insight_statement:     string;
      why_does_this_matter:  string;
      hook_formula_used:     string;
    };

    return {
      insight_id:           'insight-' + randomUUID().slice(0, 8),
      clip_id:              clip.clip_id,
      hook: {
        text:    (p.hook_text ?? '').substring(0, 80),
        formula: p.hook_formula,
      },
      pre_clip_commentary:  (p.pre_clip_commentary  ?? '').substring(0, 200),
      post_clip_commentary: (p.post_clip_commentary ?? '').substring(0, 200),
      insight_statement:    (p.insight_statement    ?? '').substring(0, 200),
      why_does_this_matter: p.why_does_this_matter  ?? '',
      hook_formula_used:    p.hook_formula_used     ?? String(p.hook_formula),
      speaker_name:         clip.speaker,
      cloud_cost_usd:       costUsd,
    };
  }
}