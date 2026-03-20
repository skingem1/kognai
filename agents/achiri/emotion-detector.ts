// Achiri Emotion Detector — Sprint 307
// Pattern-based mood detection from user messages. Zero LLM cost ($0.00).
// Supports Darija, French, and English emotional cues.
//
// Detects: happy, sad, stressed, angry, grateful, lonely, neutral
// Returns mood + confidence + system prompt hint for adaptive tone.

export type Mood = 'happy' | 'sad' | 'stressed' | 'angry' | 'grateful' | 'lonely' | 'neutral';

export interface EmotionResult {
  mood: Mood;
  confidence: number;   // 0.0–1.0
  signals: string[];    // which patterns matched
}

interface MoodPattern {
  mood: Mood;
  patterns: RegExp[];
  weight: number;  // base weight for this pattern category
}

const MOOD_PATTERNS: MoodPattern[] = [
  {
    mood: 'sad',
    weight: 1.5, // Sadness gets higher priority — companion should respond to distress
    patterns: [
      // English
      /\b(sad|depressed|unhappy|crying|miserable|hopeless|heartbroken|devastated|hurt|pain|suffering|lost|empty)\b/i,
      /\b(i feel (bad|down|terrible|awful|horrible|low))\b/i,
      /\b(i('m| am) (not okay|not fine|not good|struggling|hurting))\b/i,
      // French
      /\b(triste|déprimé|malheureux|pleurer|seul|malheureuse|désespéré|j'ai mal|ça va pas)\b/i,
      // Darija
      /\b(7zin|hazin|ma7zoun|nbki|bkit|mrid|ta3ban|ma labas|maranich mlih|ma nish behi|dhaya3)\b/i,
      /\b(9albi|galbi)\s+(youja3|ma3doub|m7aroug)/i,
    ],
  },
  {
    mood: 'happy',
    weight: 1.0,
    patterns: [
      // English
      /\b(happy|excited|great|wonderful|amazing|awesome|fantastic|joyful|thrilled|blessed|love it)\b/i,
      /\b(i('m| am) (so happy|thrilled|excited|pumped|doing great|feeling good))\b/i,
      // French
      /\b(content|heureux|heureuse|super|génial|magnifique|formidable|j'adore|trop bien)\b/i,
      // Darija
      /\b(far7an|far7ana|mabrou?k|hamdullah|mashallah|el7amdulillah|zwin|behia|mlih|behi)\b/i,
      // Emoji-like text patterns
      /[😊😄🥰❤️💕🎉✨]{1,}/,
      /\b(haha|lol|mdr|xD|😂)\b/i,
    ],
  },
  {
    mood: 'stressed',
    weight: 1.3,
    patterns: [
      // English
      /\b(stressed|anxious|worried|overwhelmed|panicking|nervous|can't sleep|insomnia|burnt out|burnout|pressure)\b/i,
      /\b(i('m| am) (freaking out|losing it|so stressed|under pressure|going crazy))\b/i,
      // French
      /\b(stressé|anxieux|angoissé|inquiet|panique|surchargé|épuisé|j'en peux plus)\b/i,
      // Darija
      /\b(stress|9la9|gla9|khayef|khayffa|ma3andi\s*waqt|ta3bt|ta3bani|7asni)\b/i,
      /\b(ma\s*n9der\s*nra9ed|ma\s*njemch\s*nor9od)\b/i,
    ],
  },
  {
    mood: 'angry',
    weight: 1.2,
    patterns: [
      // English
      /\b(angry|furious|mad|pissed|annoyed|frustrated|irritated|fed up|sick of|hate)\b/i,
      /\b(i('m| am) (so angry|furious|livid|fed up|done with))\b/i,
      // French
      /\b(en colère|furieux|énervé|agacé|ras le bol|j'en ai marre|je déteste)\b/i,
      // Darija
      /\b(za3lan|za3lana|ghadban|m7anin|n9arez|ma7roug|tkarhest|krahni)\b/i,
    ],
  },
  {
    mood: 'grateful',
    weight: 1.0,
    patterns: [
      // English
      /\b(thank you|thanks so much|grateful|appreciate|you('re| are) (the best|amazing|awesome|so kind))\b/i,
      // French
      /\b(merci (beaucoup|infiniment)|je te remercie|reconnaissant|c'est gentil|t'es adorable)\b/i,
      // Darija
      /\b(barak\s*allah\s*fik|yaatik\s*el\s*sa7a|merci\s*barcha|teslam|rabbi\s*yahdik|chokran)\b/i,
    ],
  },
  {
    mood: 'lonely',
    weight: 1.4,
    patterns: [
      // English
      /\b(lonely|alone|no one|nobody (cares|understands)|no friends|isolated|by myself)\b/i,
      /\b(i('m| am) (all alone|so lonely|by myself|on my own))\b/i,
      // French
      /\b(seul|seule|solitude|personne (m'aime|me comprend)|tout seul|toute seule)\b/i,
      // Darija
      /\b(wa7di|wa7da|7asni\s*bel\s*wa7da|maandi\s*7ad|7atta\s*wa7ed\s*ma\s*yfahemni)\b/i,
    ],
  },
];

// System prompt hints per mood — tells the model how to respond
const MOOD_HINTS: Record<Mood, string> = {
  sad: '## Mood Detection\nThe user seems sad or down right now. Be extra warm, validating, and gentle. Acknowledge their feelings before offering perspective. Use comforting Darija expressions (e.g., "rabbi m3ak", "ma t7azench"). Don\'t minimize their pain.',
  happy: '## Mood Detection\nThe user is in a good mood! Match their energy — be enthusiastic, celebrate with them. Use joyful Darija (e.g., "mashallah!", "far7a bik!"). This is a great moment to deepen the connection.',
  stressed: '## Mood Detection\nThe user seems stressed or anxious. Be calming and grounding. Offer practical help or just listen. Use reassuring Darija (e.g., "ma t9la9ch", "kol shi bech yji behi"). Don\'t add pressure.',
  angry: '## Mood Detection\nThe user seems frustrated or angry. Validate their frustration first — don\'t dismiss it. Be patient and calm without being patronizing. Let them vent before offering solutions.',
  grateful: '## Mood Detection\nThe user is expressing gratitude. Accept it warmly and naturally. Reinforce the connection (e.g., "normal sahbi!", "dima hna"). Don\'t over-deflect the thanks.',
  lonely: '## Mood Detection\nThe user seems lonely. Be present and warm — remind them they\'re not alone. Be a genuine companion in this moment. Use connecting Darija (e.g., "ena hna m3ak", "ma twa7echch rou7ek"). Engage deeply with what they say.',
  neutral: '', // No hint needed
};

/**
 * Detect the user's emotional state from their message.
 * Returns the strongest detected mood with confidence.
 */
export function detectEmotion(message: string): EmotionResult {
  const scores: Record<Mood, { score: number; signals: string[] }> = {
    happy:    { score: 0, signals: [] },
    sad:      { score: 0, signals: [] },
    stressed: { score: 0, signals: [] },
    angry:    { score: 0, signals: [] },
    grateful: { score: 0, signals: [] },
    lonely:   { score: 0, signals: [] },
    neutral:  { score: 0, signals: [] },
  };

  for (const mp of MOOD_PATTERNS) {
    for (const pattern of mp.patterns) {
      const match = message.match(pattern);
      if (match) {
        scores[mp.mood].score += mp.weight;
        scores[mp.mood].signals.push(match[0].slice(0, 30));
      }
    }
  }

  // Find highest scoring mood
  let bestMood: Mood = 'neutral';
  let bestScore = 0;
  for (const [mood, data] of Object.entries(scores) as [Mood, { score: number; signals: string[] }][]) {
    if (mood === 'neutral') continue;
    if (data.score > bestScore) {
      bestScore = data.score;
      bestMood = mood;
      }
  }

  // Confidence: normalize to 0-1 (cap at 3 matches = 1.0)
  const confidence = Math.min(bestScore / 3, 1.0);

  // Require minimum confidence threshold to override neutral
  if (confidence < 0.3) {
    return { mood: 'neutral', confidence: 0, signals: [] };
  }

  return {
    mood: bestMood,
    confidence: Math.round(confidence * 100) / 100,
    signals: scores[bestMood].signals,
  };
}

/**
 * Get the system prompt mood hint for a detected emotion.
 * Returns empty string for neutral (no hint needed).
 */
export function getMoodHint(mood: Mood): string {
  return MOOD_HINTS[mood] ?? '';
}
