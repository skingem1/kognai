// SCS-001 — Clip Detection Agent (Agent 3)
// Consumes: DiscoveryOutput[] from Discovery Agent
// Produces: ClipQualityScore[] (per contracts/scs-001/clip-quality-v1.json#ClipQualityScore)
// Model: qwen3:14b (POWER tier) via Ollama

import { randomUUID } from 'crypto';
import type { DiscoveryOutput } from '../scs001-discovery/index';
import { viralScorer } from '../../scripts/scs001/viral-scorer';

export interface ScoreBreakdown {
  curiosity:   number;
  emotion:     number;
  clarity:     number;
  insight:     number;
  controversy: number;
}

export interface ClipQualityScore {
  clip_id:                string;
  discovery_id:           string;
  url:                    string;
  start_seconds:          number;
  end_seconds:            number;
  duration_seconds:       number;
  quality_score:          number;
  score_breakdown:        ScoreBreakdown;
  phrase_triggers_matched: string[];
  speaker:                string;
  topic_tags:             string[];
  qualified:              boolean;
  rejection_reason?:      string;
  scene_density_score?:   number;
  audio_excitement?:      number;
  clip_topic_alignment?:  number;
  partial_viral_score?:   number;
}

const QUALITY_GATE    = 20;
const MIN_DURATION    = 5;
const MAX_DURATION    = 20;
const CONCURRENCY     = parseInt(process.env.CLIP_DETECTION_CONCURRENCY ?? '4', 10);
const OLLAMA_BASE     = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const MODEL           = process.env.CLIP_DETECTION_MODEL ?? 'qwen3:14b';

const PHRASE_TRIGGERS = [
  'in 2 years', 'by 2026', 'within 12 months',
  'nobody is talking about', 'this changes everything',
  'the dirty secret', 'i was completely wrong',
  'the reason', 'is dying', 'most people don\'t realise',
  'most people don\'t realize', 'the number one mistake',
  'here\'s what they\'re not telling you',
  'i\'ve never seen anything like this',
];

function matchPhraseTriggers(text: string): string[] {
  const lower = text.toLowerCase();
  return PHRASE_TRIGGERS.filter(p => lower.includes(p));
}

async function scoreWithLLM(topic: string, speaker: string, reason: string): Promise<ScoreBreakdown> {
  const prompt = `You are evaluating a short video clip for viral potential on TikTok.

Speaker: ${speaker}
Topic: ${topic}
Timestamp reason (why this moment was flagged): ${reason}

Score each factor from 0 to 5:
- curiosity: Does it make the viewer want to know what happens next?
- emotion: Is the speaker emotionally engaged (excited, frustrated, passionate)?
- clarity: Can someone understand the point in under 15 seconds with no context?
- insight: Is the perspective original, non-obvious, or does it contain a surprising fact?
- controversy: Does it challenge a mainstream belief or make a bold contrarian claim?

Respond ONLY with a JSON object, no explanation:
{"curiosity":3,"emotion":4,"clarity":5,"insight":3,"controversy":2}`;

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        think: false,                              // top-level for qwen3 extended thinking control
        options: { num_predict: 80, temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const json = await res.json() as { response: string };
    // Strip <think>...</think> blocks — qwen3 may still emit them despite think:false
    const rawResponse = json.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = rawResponse.match(/\{[^{}]*\}/);
    if (!match) throw new Error(`No JSON in response (got: ${rawResponse.substring(0, 120)})`);
    const parsed = JSON.parse(match[0]) as Partial<ScoreBreakdown>;
    return {
      curiosity:   Math.min(5, Math.max(0, parsed.curiosity   ?? 2)),
      emotion:     Math.min(5, Math.max(0, parsed.emotion     ?? 2)),
      clarity:     Math.min(5, Math.max(0, parsed.clarity     ?? 2)),
      insight:     Math.min(5, Math.max(0, parsed.insight     ?? 2)),
      controversy: Math.min(5, Math.max(0, parsed.controversy ?? 2)),
    };
  } catch (err) {
    console.warn(`[ClipDetection] LLM scoring failed, using fallback: ${(err as Error).message}`);
    return { curiosity: 2, emotion: 2, clarity: 3, insight: 2, controversy: 2 };
  }
}

// Concurrency-limited batch runner
async function runBatch<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

interface ScoringTask {
  disc: DiscoveryOutput;
  ts:   { start_seconds: number; end_seconds: number; reason: string };
}

export class ClipDetectionAgent {
  async run(discoveries: DiscoveryOutput[]): Promise<ClipQualityScore[]> {
    const results: ClipQualityScore[] = [];
    const scoringTasks: ScoringTask[] = [];

    // First pass: duration gate + collect LLM scoring tasks
    for (const disc of discoveries) {
      for (const ts of disc.timestamps) {
        const duration = ts.end_seconds - ts.start_seconds;

        if (duration < MIN_DURATION || duration > MAX_DURATION) {
          results.push({
            clip_id:                 `clip-${randomUUID().slice(0, 8)}`,
            discovery_id:            disc.discovery_id,
            url:                     disc.url,
            start_seconds:           ts.start_seconds,
            end_seconds:             ts.end_seconds,
            duration_seconds:        duration,
            quality_score:           0,
            score_breakdown:         { curiosity: 0, emotion: 0, clarity: 0, insight: 0, controversy: 0 },
            phrase_triggers_matched: [],
            speaker:                 disc.speaker,
            topic_tags:              disc.topic_tags,
            qualified:               false,
            rejection_reason:        'duration_out_of_range',
          });
        } else {
          scoringTasks.push({ disc, ts });
        }
      }
    }

    // Parallel LLM scoring with concurrency limit
    console.log(`[ClipDetection] ${scoringTasks.length} clips to score (concurrency: ${CONCURRENCY})`);
    const scored = await runBatch(scoringTasks, CONCURRENCY, async (task) => {
      const { disc, ts } = task;
      const duration = ts.end_seconds - ts.start_seconds;
      const topicText = disc.topic_tags.join(', ');
      const breakdown = await scoreWithLLM(topicText, disc.speaker, ts.reason ?? '');
      const baseLlmScore = breakdown.curiosity + breakdown.emotion + breakdown.clarity + breakdown.insight + breakdown.controversy;
      const triggers = matchPhraseTriggers(`${topicText} ${ts.reason ?? ''}`);
      const triggerBonus = Math.min(3, triggers.length);
      const total = Math.min(25, baseLlmScore + triggerBonus);
      const qualified = total >= QUALITY_GATE;

      // Viral scorer — async Python subprocess (graceful degradation to 0.5 on failure)
      const viralScores = await viralScorer.score(disc.url || '', disc.topic_tags || []);

      console.log(`[ClipDetection] ${qualified ? '✓' : '✗'} score=${total}/25 viral=${viralScores.partial_viral_score} | ${disc.speaker} | ${ts.start_seconds}s-${ts.end_seconds}s`);

      return {
        clip_id:                 `clip-${randomUUID().slice(0, 8)}`,
        discovery_id:            disc.discovery_id,
        url:                     disc.url,
        start_seconds:           ts.start_seconds,
        end_seconds:             ts.end_seconds,
        duration_seconds:        duration,
        quality_score:           total,
        score_breakdown:         breakdown,
        phrase_triggers_matched: triggers,
        speaker:                 disc.speaker,
        topic_tags:              disc.topic_tags,
        qualified,
        rejection_reason:        qualified ? undefined : `score_${total}_below_gate_${QUALITY_GATE}`,
        scene_density_score:     viralScores.scene_density_score,
        audio_excitement:        viralScores.audio_excitement,
        clip_topic_alignment:    viralScores.clip_topic_alignment,
        partial_viral_score:     viralScores.partial_viral_score,
      } as ClipQualityScore;
    });

    results.push(...scored);
    const qualifiedCount = results.filter(r => r.qualified).length;
    console.log(`[ClipDetection] ${results.length} clips scored → ${qualifiedCount} qualified (gate: ${QUALITY_GATE}/25)`);
    return results;
  }
}
