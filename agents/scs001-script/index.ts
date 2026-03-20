// SCS-001 — Script Agent (Bridge: Insight → Editing)
// Consumes: InsightBrief[] from Insight Agent
// Produces: ScriptBundle[] (per contracts/scs-001/script-bundle-v1.json)
// Model: Deterministic base + optional LLM rewrite (qwen3:14b local / Claude Sonnet cloud)
// Maps editorial content to 6-segment video timeline + pattern interrupts
// Sprint 249: Added LLM rewrite mode — set LLM_REWRITE=1 to enable creative rewriting

import { randomUUID } from 'crypto';
import type { InsightBrief } from '../scs001-insight/index';
import { rewriteScript, type RewriteResult } from '../../scripts/scs001/llm-script-rewriter';
import { getOptimalHookFormula } from '../../scripts/scs001/hook-optimizer';
import { getOptimalDuration, type DurationConfig } from './length-optimizer';

export interface ScriptSegment {
  segment_name: 'hook' | 'context' | 'clip' | 'commentary' | 'insight' | 'loop' | 'reaction' | 'point' | 'twist' | 'cta';
  start_s:      number;
  end_s:        number;
  voiceover_text:   string;
  visual_directive: string;
  caption_text:     string;
}

// Sprint 444: Video template types
type VideoTemplate = 'standard' | 'reaction' | 'listicle';

export interface PatternInterrupt {
  time_s: number;
  type:   'cut' | 'zoom' | 'text_pop' | 'color_shift' | 'motion' | 'overlay';
}

export interface ScriptBundle {
  script_id:              string;
  insight_id:             string;
  clip_id:                string;
  segments:               ScriptSegment[];
  pattern_interrupts:     PatternInterrupt[];
  total_duration_seconds: number;
  loop_ending:            boolean;
  why_does_this_matter:   string;
  speaker_name:           string;
  hook_formula_used:      string;
  template?:              VideoTemplate;  // Sprint 444
}

// Interrupt type rotation — ensures visual variety
const INTERRUPT_TYPES: PatternInterrupt['type'][] = [
  'cut', 'zoom', 'text_pop', 'color_shift', 'motion', 'overlay',
];

// Proven TikTok hook templates by formula type.
// {topic} is replaced with the first ~60 chars of the raw insight text.
const HOOK_TEMPLATES: Record<string, string[]> = {
  curiosity_gap: [
    'Nobody is talking about {topic}',
    'The truth about {topic} will change everything',
    'What they don\'t want you to know about {topic}',
    'This is why {topic} matters more than you think',
    'Did you know {topic}? Most people have no idea.',
  ],
  secret: [
    'The secret behind {topic} finally revealed',
    'Insiders know this about {topic} — now you do too',
    'Here\'s what actually happens with {topic}',
    'The real story of {topic} nobody tells you',
  ],
  contrarian: [
    'Everyone is wrong about {topic}',
    'Stop believing what you hear about {topic}',
    'Unpopular opinion: {topic} is not what you think',
    'The mainstream narrative on {topic} is backwards',
  ],
  statistic: [
    '{topic} — the numbers are more surprising than you expect',
    'The data on {topic} will shock you',
    'Here\'s the stat about {topic} that changes the conversation',
    'One number explains everything about {topic}',
  ],
  challenge: [
    'Can you handle the truth about {topic}?',
    'Most people fail to understand {topic} — can you?',
    'This is your sign to pay attention to {topic}',
    'What would happen if everyone knew about {topic}?',
  ],
  authority: [
    'The expert take on {topic} you need to hear',
    'Here\'s what the research says about {topic}',
    'Top minds are rethinking {topic} right now',
  ],
  // Sprint 443: New hook formulas for content diversity
  story: [
    'I just found out something about {topic} that blew my mind',
    'The story behind {topic} will change how you see everything',
    'Let me tell you something incredible about {topic}',
    'You won\'t believe what just happened with {topic}',
  ],
  question: [
    'Can you guess what {topic} actually does?',
    'Why is nobody asking this question about {topic}?',
    'Is {topic} the future or just hype?',
    'Did you know this was even possible with {topic}?',
  ],
  urgency: [
    '{topic} is happening right now and most people are clueless',
    'You need to know about {topic} before it\'s too late',
    'In 5 years you\'ll wish you saw this about {topic} today',
    'The clock is ticking on {topic}',
  ],
  proof: [
    '97% of people get {topic} wrong',
    'The numbers on {topic} don\'t lie — look at this',
    'After 1000 hours of research on {topic}, here\'s the truth',
    'Here\'s proof that {topic} is about to change everything',
  ],
};

function applyHookTemplate(formula: string, originalText: string): string {
  const templates = HOOK_TEMPLATES[formula];
  if (!templates || templates.length === 0) return originalText;
  const topic = originalText.substring(0, 60).replace(/[.!?]+$/, '');
  const tpl = templates[Math.floor(Math.random() * templates.length)];
  return tpl.replace('{topic}', topic);
}

function buildSegments(brief: InsightBrief, useLoop: boolean, durConfig?: DurationConfig): ScriptSegment[] {
  const hookText = applyHookTemplate(brief.hook.formula, brief.hook.text);
  const t = durConfig?.segment_timings ?? {
    hook: [0, 2], context: [2, 5], clip: [5, 12],
    commentary: [12, 18], insight: [18, 24], loop: [24, 28],
  };

  const segments: ScriptSegment[] = [
    {
      segment_name:     'hook',
      start_s:          t.hook[0],
      end_s:            t.hook[1],
      voiceover_text:   hookText,
      visual_directive: 'title_card',
      caption_text:     hookText,
    },
    {
      segment_name:     'context',
      start_s:          t.context[0],
      end_s:            t.context[1],
      voiceover_text:   brief.pre_clip_commentary,
      visual_directive: 'text_overlay',
      caption_text:     brief.pre_clip_commentary,
    },
    {
      segment_name:     'clip',
      start_s:          t.clip[0],
      end_s:            t.clip[1],
      voiceover_text:   '',  // original audio plays
      visual_directive: 'source_clip',
      caption_text:     '',  // no caption during clip
    },
    {
      segment_name:     'commentary',
      start_s:          t.commentary[0],
      end_s:            t.commentary[1],
      voiceover_text:   brief.post_clip_commentary,
      visual_directive: 'text_overlay',
      caption_text:     brief.post_clip_commentary,
    },
    {
      segment_name:     'insight',
      start_s:          t.insight[0],
      end_s:            t.insight[1],
      voiceover_text:   brief.insight_statement + ' ' + brief.why_does_this_matter.substring(0, 100),
      visual_directive: 'text_overlay',
      caption_text:     brief.insight_statement,
    },
  ];

  if (useLoop && t.loop) {
    segments.push({
      segment_name:     'loop',
      start_s:          t.loop[0],
      end_s:            t.loop[1],
      voiceover_text:   hookText,
      visual_directive: 'title_card',
      caption_text:     'Watch again? ' + hookText.substring(0, 40),
    });
  }

  return segments;
}

// Sprint 444: Reaction template — clip first, then react
// TikTok native: viewers see the interesting clip immediately, hook is visual
function buildReactionSegments(brief: InsightBrief): ScriptSegment[] {
  const hookText = applyHookTemplate(brief.hook.formula, brief.hook.text);
  return [
    {
      segment_name:     'clip',
      start_s:          0,
      end_s:            8,
      voiceover_text:   '',  // original audio plays
      visual_directive: 'source_clip',
      caption_text:     '',
    },
    {
      segment_name:     'reaction',
      start_s:          8,
      end_s:            13,
      voiceover_text:   hookText,
      visual_directive: 'text_overlay',
      caption_text:     hookText,
    },
    {
      segment_name:     'insight',
      start_s:          13,
      end_s:            20,
      voiceover_text:   brief.insight_statement + ' ' + brief.why_does_this_matter.substring(0, 80),
      visual_directive: 'text_overlay',
      caption_text:     brief.insight_statement,
    },
    {
      segment_name:     'cta',
      start_s:          20,
      end_s:            24,
      voiceover_text:   'Follow for more like this',
      visual_directive: 'title_card',
      caption_text:     'Follow for more',
    },
  ];
}

// Sprint 444: Listicle template — numbered points, fast pacing
// TikTok native: "3 things about X" format drives completion rate
function buildListicleSegments(brief: InsightBrief): ScriptSegment[] {
  const hookText = applyHookTemplate(brief.hook.formula, brief.hook.text);
  const points = [
    brief.pre_clip_commentary,
    brief.insight_statement,
    brief.post_clip_commentary,
  ];
  return [
    {
      segment_name:     'hook',
      start_s:          0,
      end_s:            3,
      voiceover_text:   hookText,
      visual_directive: 'title_card',
      caption_text:     hookText,
    },
    {
      segment_name:     'point',
      start_s:          3,
      end_s:            10,
      voiceover_text:   '1. ' + points[0],
      visual_directive: 'source_clip',
      caption_text:     '1. ' + points[0].substring(0, 60),
    },
    {
      segment_name:     'point',
      start_s:          10,
      end_s:            16,
      voiceover_text:   '2. ' + points[1],
      visual_directive: 'text_overlay',
      caption_text:     '2. ' + points[1].substring(0, 60),
    },
    {
      segment_name:     'twist',
      start_s:          16,
      end_s:            22,
      voiceover_text:   '3. ' + points[2] + ' ' + brief.why_does_this_matter.substring(0, 60),
      visual_directive: 'text_overlay',
      caption_text:     '3. ' + points[2].substring(0, 60),
    },
  ];
}

// Sprint 444: Template selection — deterministic based on insight_id hash
function selectTemplate(insightId: string): VideoTemplate {
  const hash = insightId.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
  const templates: VideoTemplate[] = ['standard', 'standard', 'reaction', 'listicle']; // 50% standard, 25% each alt
  return templates[Math.abs(hash) % templates.length];
}

function buildPatternInterrupts(totalDuration: number): PatternInterrupt[] {
  const interrupts: PatternInterrupt[] = [];
  // Place interrupts every 2.5 seconds (ensures >= 8 for 24s, >= 10 for 28s)
  const interval = 2.5;
  let t = interval;
  let typeIdx = 0;
  while (t < totalDuration) {
    interrupts.push({
      time_s: Math.round(t * 10) / 10,
      type:   INTERRUPT_TYPES[typeIdx % INTERRUPT_TYPES.length],
    });
    typeIdx++;
    t += interval;
  }
  return interrupts;
}

const LLM_REWRITE = process.env.LLM_REWRITE === '1' || process.env.LLM_REWRITE === 'true';
const LLM_CLOUD   = process.env.LLM_REWRITE_CLOUD === '1' || process.env.LLM_REWRITE_CLOUD === 'true';

export class ScriptAgent {
  /**
   * Synchronous deterministic mode — no LLM calls.
   * Use runAsync() for LLM-enhanced rewriting.
   */
  run(briefs: InsightBrief[]): ScriptBundle[] {
    console.log('[ScriptAgent] ' + briefs.length + ' InsightBriefs in (deterministic mode)');

    const bundles: ScriptBundle[] = [];
    for (const brief of briefs) {
      try {
        const bundle = this.buildBundle(brief);
        bundles.push(bundle);
        console.log('[ScriptAgent] \u2713 ' + brief.insight_id + ' \u2192 ' + bundle.segments.length + ' segments, ' + bundle.pattern_interrupts.length + ' interrupts');
      } catch (err) {
        console.warn('[ScriptAgent] \u2717 ' + brief.insight_id + ' failed: ' + (err as Error).message);
      }
    }

    console.log('[ScriptAgent] ' + bundles.length + '/' + briefs.length + ' ScriptBundles generated');
    return bundles;
  }

  /**
   * Async mode with LLM rewriting.
   * 1. Build deterministic base script
   * 2. Send to LLM for creative rewriting (if LLM_REWRITE=1)
   * 3. Fallback to deterministic if LLM fails
   */
  async runAsync(
    briefs: InsightBrief[],
    transcripts: Map<string, string> = new Map(),
    options: { useCloud?: boolean; dryRun?: boolean } = {}
  ): Promise<ScriptBundle[]> {
    const useCloud = options.useCloud ?? LLM_CLOUD;
    const dryRun = options.dryRun ?? false;
    const enableRewrite = LLM_REWRITE || options.useCloud !== undefined;

    console.log(`[ScriptAgent] ${briefs.length} InsightBriefs in (${enableRewrite ? 'LLM rewrite' : 'deterministic'} mode)`);

    const bundles: ScriptBundle[] = [];
    let rewriteCount = 0;

    for (const brief of briefs) {
      try {
        // Step 1: deterministic base
        const base = this.buildBundle(brief);

        if (enableRewrite && !dryRun) {
          // Step 2: LLM rewrite
          const transcript = transcripts.get(brief.clip_id);
          const result: RewriteResult = await rewriteScript(
            { bundle: base, transcript },
            useCloud
          );
          bundles.push(result.bundle);
          if (result.rewritten) rewriteCount++;
          console.log(`[ScriptAgent] ${result.rewritten ? '✓ LLM' : '○ base'} ${brief.insight_id} → ${result.model_used} (${result.latency_ms}ms, $${result.cost_usd})`);
        } else {
          bundles.push(base);
          console.log('[ScriptAgent] \u2713 ' + brief.insight_id + ' → ' + base.segments.length + ' segments');
        }
      } catch (err) {
        console.warn('[ScriptAgent] \u2717 ' + brief.insight_id + ' failed: ' + (err as Error).message);
      }
    }

    console.log(`[ScriptAgent] ${bundles.length}/${briefs.length} ScriptBundles (${rewriteCount} LLM-rewritten)`);
    return bundles;
  }

  private buildBundle(brief: InsightBrief): ScriptBundle {
    // Sprint 451: Hook formula optimization — use optimizer when HOOK_OPTIMIZE=1
    const HOOK_OPTIMIZE = process.env.HOOK_OPTIMIZE === '1' || process.env.HOOK_OPTIMIZE === 'true';
    let effectiveBrief = brief;
    let optimizedFormula: string | undefined;

    if (HOOK_OPTIMIZE) {
      try {
        optimizedFormula = getOptimalHookFormula();
        // Override the brief's formula with the optimizer's pick
        effectiveBrief = {
          ...brief,
          hook: { ...brief.hook, formula: optimizedFormula as any },
          hook_formula_used: optimizedFormula,
        };
        console.log(`[ScriptAgent] Hook optimizer: ${brief.hook.formula} → ${optimizedFormula}`);
      } catch (e) {
        // Fallback to original formula
        console.warn(`[ScriptAgent] Hook optimizer failed, using original: ${(e as Error).message}`);
      }
    }

    // Sprint 480: Video length optimizer — classify complexity → pick duration
    const durConfig = getOptimalDuration({
      hook_text: effectiveBrief.hook.text,
      pre_clip_commentary: effectiveBrief.pre_clip_commentary,
      post_clip_commentary: effectiveBrief.post_clip_commentary,
      insight_statement: effectiveBrief.insight_statement,
      why_does_this_matter: effectiveBrief.why_does_this_matter,
      hook_formula: effectiveBrief.hook.formula,
    });
    console.log(`[ScriptAgent] Length optimizer: ${durConfig.target_duration}s (${durConfig.reason})`);

    // Sprint 444: Select video template based on insight ID
    const template = selectTemplate(effectiveBrief.insight_id);

    let segments: ScriptSegment[];
    let useLoop = false;

    switch (template) {
      case 'reaction':
        segments = buildReactionSegments(effectiveBrief);
        break;
      case 'listicle':
        segments = buildListicleSegments(effectiveBrief);
        break;
      default: {
        // Standard template — use length-optimized timings
        const reWatchHooks = ['curiosity_gap', 'secret', 'story', 'proof'];
        useLoop = reWatchHooks.includes(effectiveBrief.hook.formula);
        segments = buildSegments(effectiveBrief, useLoop, durConfig);
        break;
      }
    }

    const totalDuration = segments[segments.length - 1].end_s;
    const interrupts = buildPatternInterrupts(totalDuration);

    return {
      script_id:              'script-' + randomUUID().slice(0, 8),
      insight_id:             effectiveBrief.insight_id,
      clip_id:                effectiveBrief.clip_id,
      segments,
      pattern_interrupts:     interrupts,
      total_duration_seconds: totalDuration,
      loop_ending:            useLoop,
      why_does_this_matter:   effectiveBrief.why_does_this_matter,
      speaker_name:           effectiveBrief.speaker_name,
      hook_formula_used:      optimizedFormula ?? effectiveBrief.hook_formula_used,
      template,
    };
  }
}
