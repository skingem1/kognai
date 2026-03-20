// SCS-001 — Insight Agent (Agent 4)
// Consumes: ClipQualityScore[] (qualified === true only) from Clip Detection Agent
// Produces: InsightBrief[] (per contracts/scs-001/insight-brief-v1.json)
// Model: Claude Sonnet via ClawRouter — constitutional layer
// Block B: operates on mock qualified clips

import { randomUUID } from 'crypto';
import type { ClipQualityScore } from '../scs001-clip-detection/index';
import { routeCall } from '../../scripts/lib/clawrouter-v2';

export interface InsightBrief {
  insight_id:           string;
  clip_id:              string;
  hook:                 { text: string; formula: 'curiosity_gap' | 'contrarian' | 'authority' | 'secret' | 'story' | 'question' | 'urgency' | 'proof' | 'countdown' | 'hot_take' };
  pre_clip_commentary:  string;
  post_clip_commentary: string;
  insight_statement:    string;
  why_does_this_matter: string;
  hook_formula_used:    string;
  speaker_name:         string;
  cloud_cost_usd:       number;
}

// Sprint 543: 10 hook formulas for maximum diversity
const ALL_HOOK_FORMULAS: InsightBrief['hook']['formula'][] = [
  'curiosity_gap', 'contrarian', 'authority', 'secret',
  'story', 'question', 'urgency', 'proof',
  'countdown', 'hot_take',
];

// Sprint 524: Hook text templates per formula
const HOOK_TEXTS: Record<string, string[]> = {
  curiosity_gap: ['This is why %s — here is what nobody expected', 'Wait until you see what %s just revealed'],
  secret:        ['Insiders know this about %s', 'The hidden truth about %s that nobody talks about'],
  contrarian:    ['Unpopular opinion: %s', 'Everyone is wrong about %s — here is why'],
  authority:     ['The expert take on %s', 'Years of research confirm %s'],
  story:         ['I just found out something mind-blowing about %s', 'The story behind %s will change how you see everything'],
  question:      ['Did you know this about %s?', 'Why is nobody asking this about %s?'],
  urgency:       ['%s — and you need to know this NOW', 'The clock is ticking on %s'],
  proof:         ['The data proves %s is real', 'Here is the evidence: %s'],
  countdown:     ['3... 2... 1... %s just dropped', 'In 5 seconds you will understand why %s matters'],
  hot_take:      ['Hot take: %s is the biggest mistake in tech right now', 'Controversial opinion: %s will fail — here is why'],
};

function pickRandomFormula(): InsightBrief['hook']['formula'] {
  return ALL_HOOK_FORMULAS[Math.floor(Math.random() * ALL_HOOK_FORMULAS.length)];
}

function pickHookText(formula: string, topic: string): string {
  const templates = HOOK_TEXTS[formula] || HOOK_TEXTS['curiosity_gap'];
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace('%s', topic).slice(0, 80);
}

// Mock InsightBriefs for Block B testing
// Sprint 524: Randomize hook formula per brief for content diversity
export function getMockInsightBriefs(): InsightBrief[] {
  const clips = getMockQualifiedClips();
  const topics = [
    'OpenAI just mass-fired its safety team',
    'NVIDIA is quietly building something nobody is talking about',
    'Google just made a move that could kill every AI startup overnight',
    'The EU just passed a law that changes everything about AI',
    'This open-source AI model just beat GPT-4 — and it runs on your laptop',
  ];
  const commentaries = [
    { pre: 'Sam Altman made a statement that sent shockwaves through the AI safety community.', post: 'This confirms what insiders have been warning about for months — speed over safety.', insight: 'When the company building AGI deprioritizes safety, every AI user bears the risk.', why: 'If OpenAI ships unsafe models at scale, the regulatory backlash could freeze AI development industry-wide, costing startups and developers billions in delayed deployments and compliance overhead.' },
    { pre: 'Jensen Huang dropped a bombshell at GTC that the media completely missed.', post: 'This GPU scarcity problem is not temporary — it is structural and accelerating.', insight: 'The compute bottleneck will determine which AI companies survive the next 18 months.', why: 'Companies without guaranteed GPU access face 6-12 month inference delays, making their AI products uncompetitive. Cloud providers are already rationing capacity, forcing startups to choose between quality and cost.' },
    { pre: 'Sundar Pichai quietly announced a pricing change that flew under the radar.', post: 'When the biggest player drops prices 90%, everyone else is in trouble.', insight: 'Free AI APIs from big tech could wipe out the entire AI middleware market within 12 months.', why: 'Startups building on top of OpenAI or Anthropic APIs face an existential threat as Google offers comparable models at near-zero cost, forcing a race to the bottom that only hyperscalers can survive.' },
    { pre: 'The EU AI Act went into effect and most companies are not ready for what comes next.', post: 'Compliance deadlines are closer than you think — and the penalties are massive.', insight: 'The EU AI Act creates a two-tier internet where compliant AI thrives and non-compliant AI gets banned.', why: 'Companies deploying AI in Europe face fines up to 7% of global revenue for non-compliance. This affects every SaaS product using AI features, from chatbots to recommendation engines.' },
    { pre: 'A small team just released a model that changes the economics of AI forever.', post: 'When frontier-level AI runs locally for free, the entire cloud AI business model breaks.', insight: 'Local AI models reaching GPT-4 quality means the end of the API-as-moat strategy for AI companies.', why: 'Developers can now run production-quality AI without paying per token. This shifts power from cloud providers to hardware makers and open-source communities.' },
  ];
  const defaultSpeakers = ['Sam Altman', 'Jensen Huang', 'Sundar Pichai', 'Margrethe Vestager', 'ThePrimeagen'];

  return topics.map((topic, i) => {
    const formula = pickRandomFormula();
    const hookText = pickHookText(formula, topic);
    const c = commentaries[i];
    return {
      insight_id:           `insight-mock-${String(i + 1).padStart(3, '0')}`,
      clip_id:              clips.length > i ? clips[i].clip_id : `clip-mock-${String(i + 1).padStart(3, '0')}`,
      hook:                 { text: hookText, formula },
      pre_clip_commentary:  c.pre,
      post_clip_commentary: c.post,
      insight_statement:    c.insight,
      why_does_this_matter: c.why,
      hook_formula_used:    formula,
      speaker_name:         clips.length > i ? clips[i].speaker : defaultSpeakers[i],
      cloud_cost_usd:       0.004,
    };
  });
}

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
    {
      clip_id:                 'clip-mock-003',
      discovery_id:            'disc-mock-003',
      url:                     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start_seconds:           240,
      end_seconds:             255,
      duration_seconds:        15,
      quality_score:           23,
      score_breakdown:         { curiosity: 5, emotion: 4, clarity: 5, insight: 5, controversy: 4 },
      phrase_triggers_matched: ['could kill'],
      speaker:                 'Sundar Pichai',
      topic_tags:              ['Google', 'AI pricing', 'competition', 'startups'],
      qualified:               true,
    },
    {
      clip_id:                 'clip-mock-004',
      discovery_id:            'disc-mock-004',
      url:                     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start_seconds:           360,
      end_seconds:             375,
      duration_seconds:        15,
      quality_score:           21,
      score_breakdown:         { curiosity: 4, emotion: 4, clarity: 5, insight: 4, controversy: 4 },
      phrase_triggers_matched: ['nobody noticed'],
      speaker:                 'Margrethe Vestager',
      topic_tags:              ['EU', 'AI Act', 'regulation', 'compliance'],
      qualified:               true,
    },
    {
      clip_id:                 'clip-mock-005',
      discovery_id:            'disc-mock-005',
      url:                     'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start_seconds:           480,
      end_seconds:             495,
      duration_seconds:        15,
      quality_score:           24,
      score_breakdown:         { curiosity: 5, emotion: 5, clarity: 5, insight: 5, controversy: 4 },
      phrase_triggers_matched: ['runs on your laptop'],
      speaker:                 'ThePrimeagen',
      topic_tags:              ['open-source', 'local AI', 'GPT-4', 'democratization'],
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

const MAX_PER_SPEAKER = 3;

export class InsightAgent {
  async run(clips: ClipQualityScore[]): Promise<InsightBrief[]> {
    const qualified = clips.filter(c => c.qualified);
    console.log('[InsightAgent] ' + clips.length + ' clips in → ' + qualified.length + ' qualified');

    const speakerCount = new Map<string, number>();
    const briefs: InsightBrief[] = [];
    for (const clip of qualified) {
      const count = speakerCount.get(clip.speaker) ?? 0;
      if (count >= MAX_PER_SPEAKER) {
        console.warn('[InsightAgent] Speaker cap: skipping ' + clip.clip_id + ' (' + clip.speaker + ' already has ' + count + ')');
        continue;
      }
      speakerCount.set(clip.speaker, count + 1);
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

    // Sprint 288: local-first mode — use T2 POWER (qwen3:14b, $0) instead of
    // T3 APEX (cloud). Downstream QC stage catches low-quality output.
    // Previous apex routing caused 26min timeouts with 0 insights generated.
    const result = await routeCall({
      task_type:           'insight_generation',
      tier_class:          'text',
      complexity:          'power',
      context_tokens:      800,
      constitutional_flag: false,
      agent_id:            'scs001-insight',
      payload:             { prompt },
    });
    const content = result.content;
    const costUsd = result.cost_usd;

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