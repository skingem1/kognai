// Hook Quality Text Scorer — lightweight text-only viral signal
// Pure TypeScript, no deps. Scores hook text for viral potential (0-1).

const VIRAL_TRIGGER_WORDS = [
  'shocking', 'unbelievable', 'jaw-dropping', 'insane', 'mind-blowing',
  'nostalgic', 'remember when', 'grew up', 'childhood',
  'hilarious', 'funniest', 'can\'t stop laughing',
  'terrifying', 'creepy', 'disturbing',
  'heartwarming', 'wholesome', 'faith in humanity',
  'secret', 'hidden', 'nobody knows', 'they don\'t want you to know',
];

const SUPERLATIVES = [
  'best', 'worst', 'most', 'least', 'biggest', 'smallest',
  'fastest', 'strongest', 'greatest', 'deadliest', 'richest',
  'craziest', 'strangest', 'weirdest',
];

function hasQuestion(text: string): boolean {
  return /\?/.test(text) || /^(who|what|why|how|when|where|which|did|do|does|is|are|can|could|would|will)\b/i.test(text);
}

function hasNumber(text: string): boolean {
  return /\d+/.test(text);
}

function hasSuperlative(text: string): boolean {
  const lower = text.toLowerCase();
  return SUPERLATIVES.some(s => lower.includes(s));
}

function countViralTriggers(text: string): number {
  const lower = text.toLowerCase();
  return VIRAL_TRIGGER_WORDS.filter(w => lower.includes(w)).length;
}

function hasProperNoun(text: string): boolean {
  // Look for capitalized words that aren't at sentence start
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    if (/^[A-Z][a-z]/.test(words[i])) return true;
  }
  return false;
}

/**
 * Score hook text for viral quality. Returns 0-1.
 * @param hookText - The hook / headline text
 * @param whyDoesThisMatter - The "why this matters" explanation (specificity signal)
 */
export function hookQualityScore(hookText: string, whyDoesThisMatter: string): number {
  let score = 0;

  // (1) Hook length: 5-15 words is optimal zone → base 0.3
  const wordCount = hookText.trim().split(/\s+/).length;
  if (wordCount >= 5 && wordCount <= 15) {
    score += 0.3;
  } else if (wordCount >= 3 && wordCount <= 20) {
    score += 0.15; // partial credit
  }

  // (2) Contains question / number / superlative → +0.1 each
  if (hasQuestion(hookText)) score += 0.1;
  if (hasNumber(hookText)) score += 0.1;
  if (hasSuperlative(hookText)) score += 0.1;

  // (3) Viral trigger words → +0.15 each (from hook text)
  const triggerCount = countViralTriggers(hookText);
  score += triggerCount * 0.15;

  // (4) whyDoesThisMatter specificity: number + proper noun → +0.1 each
  if (hasNumber(whyDoesThisMatter)) score += 0.1;
  if (hasProperNoun(whyDoesThisMatter)) score += 0.1;

  return Math.min(1.0, Math.round(score * 100) / 100);
}
