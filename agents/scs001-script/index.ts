// SCS-001 — Script Agent (Bridge: Insight → Editing)
// Consumes: InsightBrief[] from Insight Agent
// Produces: ScriptBundle[] (per contracts/scs-001/script-bundle-v1.json)
// Model: Deterministic base + optional LLM rewrite (qwen3:14b local / Claude Sonnet cloud)
// Maps editorial content to 6-segment video timeline + pattern interrupts
// Sprint 249: Added LLM rewrite mode — set LLM_REWRITE=1 to enable creative rewriting

import { randomUUID } from 'crypto';
import type { InsightBrief } from '../scs001-insight/index';
import { rewriteScript, type RewriteResult } from '../../scripts/scs001/llm-script-rewriter';

export interface ScriptSegment {
  segment_name: 'hook' | 'context' | 'clip' | 'commentary' | 'insight' | 'loop';
  start_s:      number;
  end_s:        number;
  voiceover_text:   string;
  visual_directive: string;
  caption_text:     string;
}

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

function buildSegments(brief: InsightBrief, useLoop: boolean): ScriptSegment[] {
  const hookText = applyHookTemplate(brief.hook.formula, brief.hook.text);
  const segments: ScriptSegment[] = [
    {
      segment_name:     'hook',
      start_s:          0,
      end_s:            2,
      voiceover_text:   hookText,
      visual_directive: 'title_card',
      caption_text:     hookText,
    },
    {
      segment_name:     'context',
      start_s:          2,
      end_s:            5,
      voiceover_text:   brief.pre_clip_commentary,
      visual_directive: 'text_overlay',
      caption_text:     brief.pre_clip_commentary,
    },
    {
      segment_name:     'clip',
      start_s:          5,
      end_s:            12,
      voiceover_text:   '',  // original audio plays
      visual_directive: 'source_clip',
      caption_text:     '',  // no caption during clip
    },
    {
      segment_name:     'commentary',
      start_s:          12,
      end_s:            18,
      voiceover_text:   brief.post_clip_commentary,
      visual_directive: 'text_overlay',
      caption_text:     brief.post_clip_commentary,
    },
    {
      segment_name:     'insight',
      start_s:          18,
      end_s:            24,
      voiceover_text:   brief.insight_statement + ' ' + brief.why_does_this_matter.substring(0, 100),
      visual_directive: 'text_overlay',
      caption_text:     brief.insight_statement,
    },
  ];

  if (useLoop) {
    segments.push({
      segment_name:     'loop',
      start_s:          24,
      end_s:            28,
      voiceover_text:   hookText,
      visual_directive: 'title_card',
      caption_text:     'Watch again? ' + hookText.substring(0, 40),
    });
  }

  return segments;
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
    // Decide loop: use loop if hook formula triggers re-watch behavior
    const reWatchHooks = ['curiosity_gap', 'secret', 'story', 'proof'];
    const useLoop = reWatchHooks.includes(brief.hook.formula);
    const segments = buildSegments(brief, useLoop);
    const totalDuration = segments[segments.length - 1].end_s;
    const interrupts = buildPatternInterrupts(totalDuration);

    return {
      script_id:              'script-' + randomUUID().slice(0, 8),
      insight_id:             brief.insight_id,
      clip_id:                brief.clip_id,
      segments,
      pattern_interrupts:     interrupts,
      total_duration_seconds: totalDuration,
      loop_ending:            useLoop,
      why_does_this_matter:   brief.why_does_this_matter,
      speaker_name:           brief.speaker_name,
      hook_formula_used:      brief.hook_formula_used,
    };
  }
}
