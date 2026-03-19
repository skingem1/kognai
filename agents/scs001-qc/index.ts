// SCS-001 — QC Agent (Agent 7 — Gate)
// Consumes: CaptionedVideo[] + ScriptBundle[] + EditedVideo[]
// Produces: QualityControlGate[] (per contracts/scs-001/video-production-v1.json)
// Engine: Deterministic checklist validation — no LLM calls
// 7-item gate: ALL must pass for publishing

import type { ScriptBundle } from '../scs001-script/index';
import type { EditedVideo } from '../scs001-editing/index';
import type { CaptionedVideo } from '../scs001-caption/index';

export interface QualityControlGate {
  video_id:        string;
  gate_items: {
    why_does_this_matter:    boolean;
    hook_timing:             boolean;
    visual_change_cadence:   boolean;
    caption_readability:     boolean;
    audio_balance:           boolean;
    constitutional_filter:   boolean;
    clip_understandable:     boolean;
  };
  overall_pass:          boolean;
  failure_reason:        string | null;
  return_to_agent:       number | null;
  reviewed_at:           string;
  partial_viral_score?:  number;
}

// Generic phrases that indicate non-substantive why_does_this_matter
const GENERIC_PHRASES = [
  'this is important',
  'this matters',
  'this is interesting',
  'people should know',
  'everyone should',
  'this is significant',
  'this is relevant',
  'worth knowing',
  'pay attention',
];

function checkWhyDoesThisMatter(bundle: ScriptBundle): { pass: boolean; reason: string } {
  const text = bundle.why_does_this_matter ?? '';

  if (text.length < 20) {
    return { pass: false, reason: 'why_does_this_matter too short (' + text.length + ' chars, need >= 20)' };
  }

  const lower = text.toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    if (lower.startsWith(phrase)) {
      return { pass: false, reason: 'why_does_this_matter starts with generic phrase: "' + phrase + '"' };
    }
  }

  // Must contain at least one specific indicator (number, proper noun pattern, or consequence word)
  const hasSpecificity =
    /\d/.test(text) ||                          // contains a number
    /[A-Z][a-z]+\s[A-Z]/.test(text) ||        // proper noun pattern
    /cost|billion|million|delay|risk|threat|impact|cause|lead to|result in/i.test(text);

  if (!hasSpecificity) {
    return { pass: false, reason: 'why_does_this_matter lacks specificity (no numbers, names, or consequence indicators)' };
  }

  return { pass: true, reason: '' };
}

function checkHookTiming(editedVideo: EditedVideo): { pass: boolean; reason: string } {
  if (editedVideo.editing_structure.hook_end_s > 2) {
    return { pass: false, reason: 'Hook ends at ' + editedVideo.editing_structure.hook_end_s + 's (must be <= 2s)' };
  }
  return { pass: true, reason: '' };
}

function checkVisualChangeCadence(bundle: ScriptBundle): { pass: boolean; reason: string } {
  // Check that no gap between pattern interrupts exceeds 3 seconds
  const times = bundle.pattern_interrupts.map(pi => pi.time_s).sort((a, b) => a - b);

  if (times.length < 8) {
    return { pass: false, reason: 'Only ' + times.length + ' pattern interrupts (need >= 8)' };
  }

  // Check gap from 0 to first interrupt
  if (times[0] > 3) {
    return { pass: false, reason: 'First interrupt at ' + times[0] + 's (gap from start > 3s)' };
  }

  // Check gaps between consecutive interrupts
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > 3.1) { // 3.1s tolerance for floating point
      return { pass: false, reason: 'Gap of ' + gap.toFixed(1) + 's between interrupts at ' + times[i - 1] + 's and ' + times[i] + 's' };
    }
  }

  return { pass: true, reason: '' };
}

function checkCaptionReadability(captioned: CaptionedVideo): { pass: boolean; reason: string } {
  if (captioned.font_size_px < 48) {
    return { pass: false, reason: 'Font size ' + captioned.font_size_px + 'px (need >= 48px)' };
  }
  if (captioned.contrast_ratio < 4.5) {
    return { pass: false, reason: 'Contrast ratio ' + captioned.contrast_ratio + ' (need >= 4.5:1)' };
  }
  return { pass: true, reason: '' };
}

function checkAudioBalance(): { pass: boolean; reason: string } {
  // Audio analysis deferred to Block E — pass-through in Block C testing
  // In production: analyze audio waveform for spikes/drops
  return { pass: true, reason: '' };
}

function checkConstitutionalFilter(bundle: ScriptBundle): { pass: boolean; reason: string } {
  // Check for fabrication indicators in commentary
  const allText = bundle.segments.map(s => s.voiceover_text).join(' ');

  // Red flags: direct quotes without source attribution
  if (/said\s+"[^"]{50,}"/.test(allText)) {
    return { pass: false, reason: 'Potential fabricated long quote detected in voiceover text' };
  }

  // Red flags: absolute claims without hedging
  const absolutePatterns = [
    /will definitely/i,
    /guaranteed to/i,
    /100% certain/i,
    /proven fact that/i,
  ];
  for (const pattern of absolutePatterns) {
    if (pattern.test(allText)) {
      return { pass: false, reason: 'Absolute claim detected: ' + pattern.source };
    }
  }

  return { pass: true, reason: '' };
}

function checkClipUnderstandable(bundle: ScriptBundle): { pass: boolean; reason: string } {
  // Verify that the video has enough context segments to be understandable
  // without watching the original source
  const hasContext    = bundle.segments.some(s => s.segment_name === 'context' && s.voiceover_text.length > 10);
  const hasInsight    = bundle.segments.some(s => s.segment_name === 'insight' && s.voiceover_text.length > 10);
  const hasCommentary = bundle.segments.some(s => s.segment_name === 'commentary' && s.voiceover_text.length > 10);

  if (!hasContext) {
    return { pass: false, reason: 'Missing context segment — viewer cannot understand clip without source' };
  }
  if (!hasInsight) {
    return { pass: false, reason: 'Missing insight — no takeaway for viewer' };
  }
  if (!hasCommentary) {
    return { pass: false, reason: 'Missing commentary — clip lacks analysis' };
  }

  return { pass: true, reason: '' };
}

export class QCAgent {
  run(
    captionedVideos: CaptionedVideo[],
    bundles: ScriptBundle[],
    editedVideos: EditedVideo[],
  ): QualityControlGate[] {
    console.log('[QCAgent] ' + captionedVideos.length + ' CaptionedVideos in for review');

    // Build lookup maps
    const bundleMap = new Map<string, ScriptBundle>();
    for (const b of bundles) bundleMap.set(b.insight_id, b);
    const editedMap = new Map<string, EditedVideo>();
    for (const v of editedVideos) editedMap.set(v.video_id, v);

    const gates: QualityControlGate[] = [];
    for (const cv of captionedVideos) {
      try {
        const bundle = bundleMap.get(editedMap.get(cv.video_id)?.insight_id ?? '');
        const edited = editedMap.get(cv.video_id);
        if (!bundle || !edited) {
          throw new Error('Missing upstream data for video ' + cv.video_id);
        }
        const gate = this.review(cv, bundle, edited);
        gates.push(gate);
        const status = gate.overall_pass ? '\u2713 PASS' : '\u2717 FAIL';
        console.log('[QCAgent] ' + status + ' ' + cv.video_id + (gate.failure_reason ? ' (' + gate.failure_reason + ')' : ''));
      } catch (err) {
        console.warn('[QCAgent] \u2717 ' + cv.video_id + ' review error: ' + (err as Error).message);
      }
    }

    const passed = gates.filter(g => g.overall_pass).length;
    console.log('[QCAgent] ' + passed + '/' + gates.length + ' passed QC gate');
    return gates;
  }

  private review(
    captioned: CaptionedVideo,
    bundle: ScriptBundle,
    edited: EditedVideo,
  ): QualityControlGate {
    const checks = {
      why_does_this_matter:  checkWhyDoesThisMatter(bundle),
      hook_timing:           checkHookTiming(edited),
      visual_change_cadence: checkVisualChangeCadence(bundle),
      caption_readability:   checkCaptionReadability(captioned),
      audio_balance:         checkAudioBalance(),
      constitutional_filter: checkConstitutionalFilter(bundle),
      clip_understandable:   checkClipUnderstandable(bundle),
    };

    const gate_items = {
      why_does_this_matter:  checks.why_does_this_matter.pass,
      hook_timing:           checks.hook_timing.pass,
      visual_change_cadence: checks.visual_change_cadence.pass,
      caption_readability:   checks.caption_readability.pass,
      audio_balance:         checks.audio_balance.pass,
      constitutional_filter: checks.constitutional_filter.pass,
      clip_understandable:   checks.clip_understandable.pass,
    };

    const overall_pass = Object.values(gate_items).every(v => v === true);

    // Find first failure for routing
    let failure_reason: string | null = null;
    let return_to_agent: number | null = null;

    const AGENT_ROUTING: Record<string, number> = {
      why_does_this_matter:  4,  // → Insight Agent
      hook_timing:           5,  // → Editing Agent
      visual_change_cadence: 5,  // → Editing Agent
      caption_readability:   6,  // → Caption Agent
      audio_balance:         5,  // → Editing Agent
      constitutional_filter: 4,  // → Insight Agent
      clip_understandable:   4,  // → Insight Agent
    };

    if (!overall_pass) {
      for (const [key, result] of Object.entries(checks)) {
        if (!result.pass) {
          failure_reason = key + ': ' + result.reason;
          return_to_agent = AGENT_ROUTING[key] ?? 4;
          break;
        }
      }
    }

    return {
      video_id:       captioned.video_id,
      gate_items,
      overall_pass,
      failure_reason,
      return_to_agent,
      reviewed_at:    new Date().toISOString(),
    };
  }
}
