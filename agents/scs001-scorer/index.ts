import type { ScriptBundle } from '../scs001-script/index';

export interface ScriptScore {
  script_id:  string;
  score:      number;
  passed:     boolean;
  breakdown:  { hook_strength: number; curiosity_gap: number; cta_clarity: number; topic_virality: number };
  hints:      string[];
}

const PASS_THRESHOLD = 60;

const VIRAL_SPEAKERS = [
  'samaltman', 'elonmusk', 'satyanadella', 'jensenhuang',
  'demishassabis', 'andrejkarpathy', 'alexalbert', 'gregbrockman',
];

const VIRAL_TOPICS = [
  'ai', 'gpt', 'llm', 'regulation', 'agi', 'robotics',
  'quantum', 'crypto', 'startup', 'funding', 'openai', 'claude',
];

export class ScriptScorer {
  score(bundle: ScriptBundle): ScriptScore {
    const hookSeg  = bundle.segments.find(s => s.segment_name === 'hook');
    const insightSeg = bundle.segments.find(s => s.segment_name === 'insight');
    const hookText   = hookSeg?.voiceover_text?.toLowerCase() ?? '';
    const insightText = insightSeg?.voiceover_text?.toLowerCase() ?? '';

    // --- hook_strength (0-25) ---
    let hook_strength = 0;
    if (hookSeg) {
      if (hookText.length >= 10) hook_strength += 10;
      if (hookSeg.end_s <= 2)    hook_strength += 5;
      if (['curiosity_gap', 'secret'].includes(bundle.hook_formula_used)) hook_strength += 10;
      else hook_strength += 5;
    }

    // --- curiosity_gap (0-25) ---
    let curiosity_gap = 0;
    if (/\b(what|how|why|who|when)\b/.test(hookText)) curiosity_gap += 10;
    if (/\?/.test(hookText))                            curiosity_gap += 5;
    if (/reveal|secret|nobody|just|change|everything/.test(hookText)) curiosity_gap += 10;

    // --- cta_clarity (0-25) ---
    let cta_clarity = 0;
    if (insightText.length > 30)                                    cta_clarity += 10;
    if (/watch|follow|learn|check|subscribe|share/.test(insightText)) cta_clarity += 10;
    if (bundle.why_does_this_matter.length > 50)                    cta_clarity += 5;

    // --- topic_virality (0-25) ---
    let topic_virality = 0;
    const speakerKey = bundle.speaker_name.toLowerCase().replace(/\s+/g, '');
    if (VIRAL_SPEAKERS.some(vs => speakerKey.includes(vs))) topic_virality += 15;
    const allText = bundle.segments.map(s => s.voiceover_text).join(' ').toLowerCase();
    const topicHits = VIRAL_TOPICS.filter(t => allText.includes(t)).length;
    topic_virality += Math.min(topicHits * 5, 10);

    const score = hook_strength + curiosity_gap + cta_clarity + topic_virality;
    const passed = score >= PASS_THRESHOLD;

    const hints: string[] = [];
    if (hook_strength < 15) hints.push('Strengthen hook — use curiosity_gap or secret formula');
    if (curiosity_gap < 10) hints.push('Add a question or revelation word to hook text');
    if (cta_clarity < 10)   hints.push('Add action verb to insight segment');
    if (topic_virality < 10) hints.push('Use a higher-profile speaker or trending AI topic');

    return { script_id: bundle.script_id, score, passed, breakdown: { hook_strength, curiosity_gap, cta_clarity, topic_virality }, hints };
  }
}

export function scoreAndFilter(bundles: ScriptBundle[]): { passed: ScriptBundle[]; filtered: ScriptScore[] } {
  const scorer = new ScriptScorer();
  const passed: ScriptBundle[] = [];
  const filtered: ScriptScore[] = [];
  for (const b of bundles) {
    const result = scorer.score(b);
    if (result.passed) passed.push(b);
    else filtered.push(result);
  }
  return { passed, filtered };
}
