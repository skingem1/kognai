// SCS-001 — Script Agent (Bridge: Insight → Editing)
// Consumes: InsightBrief[] from Insight Agent
// Produces: ScriptBundle[] (per contracts/scs-001/script-bundle-v1.json)
// Model: NONE — pure deterministic mapping, no LLM calls
// Maps editorial content to 6-segment video timeline + pattern interrupts

import { randomUUID } from 'crypto';
import type { InsightBrief } from '../scs001-insight/index';

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

function buildSegments(brief: InsightBrief, useLoop: boolean): ScriptSegment[] {
  const segments: ScriptSegment[] = [
    {
      segment_name:     'hook',
      start_s:          0,
      end_s:            2,
      voiceover_text:   brief.hook.text,
      visual_directive: 'title_card',
      caption_text:     brief.hook.text,
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
      voiceover_text:   brief.hook.text,
      visual_directive: 'title_card',
      caption_text:     'Watch again? ' + brief.hook.text.substring(0, 40),
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

export class ScriptAgent {
  run(briefs: InsightBrief[]): ScriptBundle[] {
    console.log('[ScriptAgent] ' + briefs.length + ' InsightBriefs in');

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

  private buildBundle(brief: InsightBrief): ScriptBundle {
    // Decide loop: use loop if hook formula is curiosity_gap or secret (re-watch hooks)
    const useLoop = brief.hook.formula === 'curiosity_gap' || brief.hook.formula === 'secret';
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
