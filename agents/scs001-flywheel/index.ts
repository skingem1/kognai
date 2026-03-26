// SCS-001 — Content Flywheel Agent (Agent 10 — Feedback Amplification)
// Consumes: PerformanceSignal[] (flywheel_triggered === true only)
// Produces: FlywheelOutput[] (4 derivative briefs per viral signal)
// Engine: Deterministic — template-based variation generation
// Per Charter: viral (>= 70% completion) triggers 4 derivative videos

import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import type { PerformanceSignal } from '../scs001-analytics/index';

export interface FlywheelDerivative {
  derivative_id:         string;
  source_signal_id:      string;
  source_video_id:       string;
  variation_type:        'different_hook' | 'different_topic' | 'different_speaker' | 'deeper_dive';
  suggested_topic:       string;
  suggested_hook_formula: string;
  suggested_speaker:     string;
  suggested_slot:        string;
  rationale:             string;
}

export interface FlywheelOutput {
  flywheel_id:       string;
  source_signal_id:  string;
  source_video_id:   string;
  derivatives:       FlywheelDerivative[];
  created_at:        string;
}

const HOOK_FORMULAS = ['curiosity_gap', 'contrarian', 'authority', 'secret'];
const RELATED_TOPICS: Record<string, string[]> = {
  'default': ['AI regulation impact', 'startup funding shifts', 'developer productivity tools', 'open source economics'],
};
const ALTERNATIVE_SPEAKERS: Record<string, string[]> = {
  'default': ['Andrej Karpathy', 'Yann LeCun', 'Demis Hassabis', 'Dario Amodei'],
};

function rotateHookFormula(current: string): string {
  const idx = HOOK_FORMULAS.indexOf(current);
  return HOOK_FORMULAS[(idx + 1) % HOOK_FORMULAS.length];
}

function getRelatedTopic(currentTopics: string[], index: number): string {
  const pool = RELATED_TOPICS['default'];
  // Pick a topic not in the current set
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(index + i) % pool.length];
    if (!currentTopics.some(t => t.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
  }
  return pool[index % pool.length];
}

function getAlternativeSpeaker(current: string, index: number): string {
  const pool = ALTERNATIVE_SPEAKERS['default'];
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(index + i) % pool.length];
    if (candidate.toLowerCase() !== current.toLowerCase()) {
      return candidate;
    }
  }
  return pool[index % pool.length];
}

export class ContentFlywheelAgent {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir ?? 'skill-bank/kognai-owned/content-flywheel';
  }

  run(signals: PerformanceSignal[]): FlywheelOutput[] {
    const allViralSignals = signals.filter(s => s.flywheel_triggered);

    // Dedup by video_id: same video published across 9 platforms produces 9 signals.
    // Keep only the best-performing (highest completion_rate) per unique video to
    // avoid generating 9× the intended 4 derivatives per viral video.
    const bestByVideo = new Map<string, PerformanceSignal>();
    for (const sig of allViralSignals) {
      const existing = bestByVideo.get(sig.video_id);
      if (!existing || sig.kpis.completion_rate > existing.kpis.completion_rate) {
        bestByVideo.set(sig.video_id, sig);
      }
    }
    const viralSignals = Array.from(bestByVideo.values());

    console.log('[FlywheelAgent] ' + viralSignals.length + ' unique viral video(s) (' +
      allViralSignals.length + ' signals, ' + signals.length + ' total)');

    if (viralSignals.length === 0) {
      console.log('[FlywheelAgent] No viral signals — flywheel idle');
      return [];
    }

    const outputs: FlywheelOutput[] = [];

    for (const signal of viralSignals) {
      const currentTopics = signal.topic_performance.topic_tags;
      const currentSpeaker = signal.speaker_performance.speaker_name;
      const currentFormula = signal.hook_formula_performance.formula;
      const currentSlot = signal.posting_slot_performance.slot;

      const derivatives: FlywheelDerivative[] = [
        {
          derivative_id:         'deriv-' + randomUUID().substring(0, 8),
          source_signal_id:      signal.signal_id,
          source_video_id:       signal.video_id,
          variation_type:        'different_hook',
          suggested_topic:       currentTopics[0] ?? 'AI trends',
          suggested_hook_formula: rotateHookFormula(currentFormula),
          suggested_speaker:     currentSpeaker,
          suggested_slot:        currentSlot,
          rationale:             'Same winning topic (' + (currentTopics[0] ?? 'AI') + ') with rotated hook formula for A/B testing',
        },
        {
          derivative_id:         'deriv-' + randomUUID().substring(0, 8),
          source_signal_id:      signal.signal_id,
          source_video_id:       signal.video_id,
          variation_type:        'different_topic',
          suggested_topic:       getRelatedTopic(currentTopics, 0),
          suggested_hook_formula: currentFormula,
          suggested_speaker:     currentSpeaker,
          suggested_slot:        currentSlot,
          rationale:             'Same winning speaker+formula applied to related topic for audience expansion',
        },
        {
          derivative_id:         'deriv-' + randomUUID().substring(0, 8),
          source_signal_id:      signal.signal_id,
          source_video_id:       signal.video_id,
          variation_type:        'different_speaker',
          suggested_topic:       currentTopics[0] ?? 'AI trends',
          suggested_hook_formula: currentFormula,
          suggested_speaker:     getAlternativeSpeaker(currentSpeaker, 0),
          suggested_slot:        currentSlot,
          rationale:             'Same winning topic+formula but different authority voice for content diversity',
        },
        {
          derivative_id:         'deriv-' + randomUUID().substring(0, 8),
          source_signal_id:      signal.signal_id,
          source_video_id:       signal.video_id,
          variation_type:        'deeper_dive',
          suggested_topic:       (currentTopics[0] ?? 'AI') + ' — deeper analysis',
          suggested_hook_formula: 'authority',
          suggested_speaker:     currentSpeaker,
          suggested_slot:        currentSlot,
          rationale:             'Deep-dive on proven topic with authority framing for audience retention',
        },
      ];

      const output: FlywheelOutput = {
        flywheel_id:      'fw-' + randomUUID().substring(0, 8),
        source_signal_id: signal.signal_id,
        source_video_id:  signal.video_id,
        derivatives,
        created_at:       new Date().toISOString(),
      };

      outputs.push(output);

      // Persist to skill-bank
      this.persist(output);

      console.log('[FlywheelAgent] ' + signal.video_id + ' → 4 derivatives generated (' +
        signal.kpis.completion_rate + '% completion, ' + signal.kpis.views + ' views)');
    }

    console.log('[FlywheelAgent] ' + outputs.length + ' flywheel outputs, ' +
      (outputs.length * 4) + ' total derivatives');
    return outputs;
  }

  private persist(output: FlywheelOutput): void {
    if (!existsSync(this.outputDir)) mkdirSync(this.outputDir, { recursive: true });
    const filename = this.outputDir + '/' + output.flywheel_id + '.json';
    writeFileSync(filename, JSON.stringify(output, null, 2));
  }
}
