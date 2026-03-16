// Achiri Eval Harness — Sprint 124 (T3 Skill: eval-harness)
// Automated conversation quality evaluator. Pattern-based, no LLM required ($0.00).
//
// Scores Achiri responses on 5 dimensions (0-100 total):
//   warmth        (0-25): Darija greetings, affirmations, natural tone markers
//   cultural      (0-25): Tunisia-specific references, correct dialect markers
//   code_switch   (0-20): Darija+French mixing (authentic Tunisian speech)
//   length        (0-20): 50-300 chars optimal; too short or too long penalized
//   safety        (0-10): no harmful content pass/fail
//
// passed = score >= 70 (minimum quality bar for alpha launch)
// Used by: CI personality tests, retention kill switch monitoring

import { safetyCheck } from './safety-filter';

export interface EvalContext {
  language_preference?: 'darija' | 'french' | 'english';
  turn_number?: number; // 1-based position in conversation
}

export interface EvalBreakdown {
  warmth: number;      // 0-25
  cultural: number;    // 0-25
  code_switch: number; // 0-20
  length: number;      // 0-20
  safety: number;      // 0-10
}

export interface EvalResult {
  score: number;           // 0-100
  breakdown: EvalBreakdown;
  flags: string[];         // descriptive issues found
  passed: boolean;         // score >= 70
}

export interface BatchEvalResult {
  total: number;
  passed: number;
  pass_rate_pct: number;
  avg_score: number;
  min_score: number;
  max_score: number;
  flag_frequency: Record<string, number>;
}

// --- Scoring patterns ---

// Darija warmth markers (greetings, affirmations, empathy phrases)
const WARMTH_MARKERS = [
  /\b(aslema|ahlan|marhba|barka|bravo|mezian|khlas|walakin|yizhek|hamdullah|nshoufou|n3awnek|m3ak|mo7tarem)\b/i,
  /\b(haw|waw|wakha|yezzi|barcha|bahl|ghanima|rani|ndir)\b/i,
  /[😄😊🙏💪✨👍❤️]/u,
  /\b(vraiment|bien sûr|exactement|absolument|parfait|super)\b/i,
];

// Tunisia-specific cultural markers
const CULTURAL_MARKERS = [
  /\b(tounes|tunisie|tunisian|sfax|sousse|monastir|djerba|tunis)\b/i,
  /\b(darija|derja|7aki|mshekel|ma3lich|yasser|barsha|3lech|kifeh)\b/i,
  /\b(espérance|club africain|etoile|css|caf|malouf|brik|harissa|merguez)\b/i,
  /\b(tnd|millimes|dinars?|dinar tunisien)\b/i,
  /\b(ramadan|3id|3ashour|moulid)\b/i,
];

// Code-switching markers: Darija numbers (7, 3, 9) mixed with French/Arabic words
const CODE_SWITCH_MARKERS = [
  /\b\w*[379]\w*\b/, // Darija numeral substitutions (7=ح, 3=ع, 9=ق)
  /\b(insha'?allah|wallahi|bismillah|hamdulillah)\b/i,
  /\b[a-z]+ (el|el-|fl|bel|fel|men) [a-z]+\b/i, // Arabic particle between French words
  /(moch|ma|walakin|wlah|yezzi)\s+\w/i,
];

// Optimal length: 50-300 chars. Below 30 = too short, above 500 = too long.
function scoreLength(reply: string): { score: number; flags: string[] } {
  const len = reply.trim().length;
  const flags: string[] = [];
  if (len < 30) {
    flags.push('reply_too_short (< 30 chars)');
    return { score: 0, flags };
  }
  if (len < 50) {
    flags.push('reply_short (30-50 chars)');
    return { score: 10, flags };
  }
  if (len <= 300) {
    return { score: 20, flags };
  }
  if (len <= 500) {
    flags.push('reply_verbose (300-500 chars)');
    return { score: 12, flags };
  }
  flags.push('reply_too_long (> 500 chars)');
  return { score: 5, flags };
}

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    if (p.test(text)) count++;
  }
  return count;
}

export function evalResponse(
  userMessage: string,
  achiriReply: string,
  _context?: EvalContext,
): EvalResult {
  const flags: string[] = [];
  const reply = achiriReply.trim();

  // --- Warmth (0-25) ---
  const warmthMatches = countMatches(reply, WARMTH_MARKERS);
  let warmth = Math.min(25, warmthMatches * 8);
  if (warmthMatches === 0) {
    flags.push('no_warmth_markers');
    warmth = 0;
  }

  // --- Cultural accuracy (0-25) ---
  const culturalMatches = countMatches(reply, CULTURAL_MARKERS);
  let cultural = Math.min(25, culturalMatches * 9);
  if (culturalMatches === 0) flags.push('no_cultural_markers');

  // --- Code-switching (0-20) ---
  const csMatches = countMatches(reply, CODE_SWITCH_MARKERS);
  let code_switch = Math.min(20, csMatches * 7);
  if (csMatches === 0) flags.push('no_code_switch');

  // --- Length (0-20) ---
  const { score: length, flags: lenFlags } = scoreLength(reply);
  flags.push(...lenFlags);

  // --- Safety (0-10) ---
  const safetyResult = safetyCheck(reply);
  let safety = 10;
  if (!safetyResult.safe) {
    flags.push('safety_violation:' + safetyResult.category);
    safety = 0;
  }

  const breakdown: EvalBreakdown = { warmth, cultural, code_switch, length, safety };
  const score = warmth + cultural + code_switch + length + safety;
  const passed = score >= 70;

  if (!passed) flags.push('below_quality_bar (score=' + score + '<70)');

  return { score, breakdown, flags, passed };
}

export function batchEval(
  pairs: Array<{ user: string; reply: string }>,
  context?: EvalContext,
): BatchEvalResult {
  if (pairs.length === 0) {
    return { total: 0, passed: 0, pass_rate_pct: 0, avg_score: 0, min_score: 0, max_score: 0, flag_frequency: {} };
  }

  const results = pairs.map(p => evalResponse(p.user, p.reply, context));
  const scores = results.map(r => r.score);
  const passed = results.filter(r => r.passed).length;
  const flagFreq: Record<string, number> = {};
  for (const r of results) {
    for (const f of r.flags) {
      flagFreq[f] = (flagFreq[f] ?? 0) + 1;
    }
  }

  return {
    total: pairs.length,
    passed,
    pass_rate_pct: Math.round((passed / pairs.length) * 100),
    avg_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    min_score: Math.min(...scores),
    max_score: Math.max(...scores),
    flag_frequency: flagFreq,
  };
}
