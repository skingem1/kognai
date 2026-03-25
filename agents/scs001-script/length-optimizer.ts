// SCS-001 — Video Length Optimizer (Sprint 480)
// Classifies topic complexity → selects optimal video duration.
// Short (15s) for simple hooks, Medium (30s) for explainers, Long (60s) for deep dives.
// Set VIDEO_LENGTH_MODE=auto (default) or VIDEO_LENGTH_MODE=15|30|60 to force.

export type VideoDuration = 15 | 30 | 60;

export interface DurationConfig {
  target_duration: VideoDuration;
  reason: string;
  segment_timings: {
    hook: [number, number];
    context: [number, number];
    clip: [number, number];
    commentary: [number, number];
    insight: [number, number];
    loop?: [number, number];
  };
}

// Complexity signals from InsightBrief content
interface ComplexityInput {
  hook_text: string;
  pre_clip_commentary: string;
  post_clip_commentary: string;
  insight_statement: string;
  why_does_this_matter: string;
  hook_formula: string;
}

// Words that indicate deep/complex topics
const DEEP_TOPIC_MARKERS = [
  'regulation', 'compliance', 'infrastructure', 'architecture', 'breakthrough',
  'research', 'academic', 'peer-reviewed', 'fundamental', 'paradigm',
  'geopolitical', 'macroeconomic', 'constitutional', 'algorithmic',
  'deployment', 'scalability', 'governance', 'sovereignty',
];

// Words that indicate simple/snappy topics
const SIMPLE_TOPIC_MARKERS = [
  'hack', 'tip', 'trick', 'secret', 'simple', 'easy', 'quick',
  'one thing', 'this app', 'free tool', 'shortcut', 'lifehack',
];

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function hasMarkers(text: string, markers: string[]): number {
  const lower = text.toLowerCase();
  return markers.filter(m => lower.includes(m)).length;
}

export function classifyComplexity(input: ComplexityInput): { score: number; level: 'simple' | 'standard' | 'deep' } {
  const allText = [
    input.hook_text, input.pre_clip_commentary,
    input.post_clip_commentary, input.insight_statement,
    input.why_does_this_matter,
  ].join(' ');

  const totalWords = countWords(allText);
  const deepHits = hasMarkers(allText, DEEP_TOPIC_MARKERS);
  const simpleHits = hasMarkers(allText, SIMPLE_TOPIC_MARKERS);

  // Score: 0-100 (higher = more complex)
  let score = 50;

  // Word count: short content = simpler, long content = deeper
  if (totalWords < 40) score -= 20;
  else if (totalWords > 80) score += 15;
  else if (totalWords > 120) score += 25;

  // Topic markers
  score += deepHits * 8;
  score -= simpleHits * 10;

  // Hook formula: some formulas naturally suit short/long
  if (['curiosity_gap', 'secret'].includes(input.hook_formula)) score -= 5;
  if (['authority', 'contrarian'].includes(input.hook_formula)) score += 10;

  score = Math.max(0, Math.min(100, score));

  const level = score < 35 ? 'simple' : score > 65 ? 'deep' : 'standard';
  return { score, level };
}

export function getOptimalDuration(input: ComplexityInput): DurationConfig {
  // Check for forced mode
  const mode = process.env.VIDEO_LENGTH_MODE;
  if (mode === '15' || mode === '30' || mode === '60') {
    const forced = parseInt(mode) as VideoDuration;
    return buildDurationConfig(forced, `forced via VIDEO_LENGTH_MODE=${mode}`);
  }

  const { level, score } = classifyComplexity(input);

  switch (level) {
    case 'simple':
      return buildDurationConfig(15, `simple topic (score: ${score})`);
    case 'deep':
      return buildDurationConfig(60, `deep topic (score: ${score})`);
    default:
      return buildDurationConfig(30, `standard topic (score: ${score})`);
  }
}

function buildDurationConfig(duration: VideoDuration, reason: string): DurationConfig {
  switch (duration) {
    case 15:
      return {
        target_duration: 15,
        reason,
        segment_timings: {
          hook:       [0, 2],
          context:    [2, 4],
          clip:       [4, 9],
          commentary: [9, 12],
          insight:    [12, 15],
        },
      };
    case 60:
      return {
        target_duration: 60,
        reason,
        segment_timings: {
          hook:       [0, 2],  // Sprint 1363: QC gate requires hook_end_s <= 2; was [0,4] causing 100% QC fail
          context:    [2, 12],
          clip:       [12, 30],
          commentary: [30, 44],
          insight:    [44, 56],
          loop:       [56, 60],
        },
      };
    default: // 30
      return {
        target_duration: 30,
        reason,
        segment_timings: {
          hook:       [0, 2],
          context:    [2, 5],
          clip:       [5, 12],
          commentary: [12, 18],
          insight:    [18, 24],
          loop:       [24, 28],
        },
      };
  }
}
