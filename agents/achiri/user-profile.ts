// Achiri User Profile Extractor — Sprint 301 + Sprint 303 (dialect detection)
// Extracts user preferences from conversation history JSONL.
// Zero LLM cost — pure pattern analysis ($0.00).
//
// Detects: preferred language, dialect variant, formality, top interests/topics, conversation stats.
// Used by: chat() to inject personalized context into system prompt.

import type { ConversationTurn } from './index';
import { AchiriMemoryStore } from './memory-store';
import { profileMessage, type DialectVariant, type Formality } from './derja-profiler';

export interface UserProfile {
  userId: string;
  preferred_language: 'darija' | 'french' | 'english' | 'mixed';
  dialect: DialectVariant;       // Sprint 303: tunisian | moroccan | algerian | etc.
  formality: Formality;          // Sprint 303: informal | neutral | formal
  dialect_confidence: number;    // Sprint 303: 0.0-1.0
  top_interests: string[];       // up to 5 recurring topics
  message_count: number;
  first_seen: string | null;     // ISO date of earliest turn
  last_seen: string | null;      // ISO date of latest turn
  avg_message_length: number;
}

// Language detection patterns
const DARIJA_MARKERS = /\b(aslema|chnahwelek|labas|3likom|inshallah|hamdullah|walla|barcha|bech|famma|enti|ena|kifech|chnowa|ya.?khi|machallah|mrigoul|hedheka|hedhika|kif|7ab|nhabek|sahbi|sa7bi)\b/i;
const FRENCH_MARKERS = /\b(bonjour|merci|comment|pourquoi|parce|aussi|beaucoup|toujours|aujourd'?hui|s'il|c'est|je suis|j'ai|nous|avec|comme|donc|encore|vraiment|bien)\b/i;
const ARABIC_SCRIPT = /[\u0600-\u06FF]{3,}/;

// Interest/topic categories with keyword patterns
const TOPIC_PATTERNS: Record<string, RegExp> = {
  education:    /\b(school|study|exam|university|cours|ecole|bac|fac|licence|master|ders|9raya|mathematic|learn)\b/i,
  technology:   /\b(code|program|app|phone|computer|internet|game|robot|ai|tech|pc|laptop|mobile)\b/i,
  health:       /\b(sa7a|health|doctor|sick|pain|sleep|stress|tired|maridh|sport|gym|exercise)\b/i,
  relationships:/\b(friend|family|love|sa7bi|ommi|baba|khouya|okhti|zawj|couple|mariage|relation)\b/i,
  work:         /\b(khedma|work|job|salary|boss|career|stage|emploi|entreprise|business|money|flous)\b/i,
  culture:      /\b(music|film|serie|book|ktab|ramadan|3id|tunisie|tunisia|sousse|sfax|tunis|carthage)\b/i,
  food:         /\b(makla|food|couscous|brik|harissa|tajine|restaurant|cafe|9ahwa|chay|kosksi)\b/i,
  religion:     /\b(allah|dieu|mosque|jame3|salat|ramadan|quran|din|iman|pray|dua)\b/i,
};

const store = new AchiriMemoryStore();

function detectLanguage(messages: string[]): UserProfile['preferred_language'] {
  let darija = 0, french = 0, english = 0, arabic = 0;
  for (const msg of messages) {
    if (DARIJA_MARKERS.test(msg)) darija++;
    if (FRENCH_MARKERS.test(msg)) french++;
    if (ARABIC_SCRIPT.test(msg)) arabic++;
    // English: default if no other markers
    if (!DARIJA_MARKERS.test(msg) && !FRENCH_MARKERS.test(msg) && !ARABIC_SCRIPT.test(msg)) english++;
  }
  // Darija includes Arabic script usage
  darija += arabic;

  const total = messages.length || 1;
  const darijaRatio = darija / total;
  const frenchRatio = french / total;
  const englishRatio = english / total;

  // Mixed if no clear majority (>50%)
  if (darijaRatio > 0.5) return 'darija';
  if (frenchRatio > 0.5) return 'french';
  if (englishRatio > 0.5) return 'english';
  return 'mixed';
}

function extractInterests(messages: string[]): string[] {
  const topicCounts: Record<string, number> = {};
  for (const msg of messages) {
    for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS)) {
      if (pattern.test(msg)) {
        topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
      }
    }
  }
  return Object.entries(topicCounts)
    .filter(([, count]) => count >= 2) // at least 2 mentions
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);
}

// Sprint 303: Aggregate dialect detection across all user messages
function detectDialect(messages: string[]): { dialect: DialectVariant; formality: Formality; confidence: number } {
  if (messages.length === 0) return { dialect: 'unknown', formality: 'neutral', confidence: 0 };

  const dialectCounts: Record<string, number> = {};
  const formalityCounts: Record<string, number> = {};
  let totalConfidence = 0;
  let profiledCount = 0;

  for (const msg of messages) {
    const profile = profileMessage(msg);
    if (profile.dialect !== 'unknown') {
      dialectCounts[profile.dialect] = (dialectCounts[profile.dialect] ?? 0) + 1;
      totalConfidence += profile.confidence;
      profiledCount++;
    }
    formalityCounts[profile.formality] = (formalityCounts[profile.formality] ?? 0) + 1;
  }

  // Winner dialect
  let dialect: DialectVariant = 'unknown';
  let maxCount = 0;
  for (const [d, count] of Object.entries(dialectCounts)) {
    if (count > maxCount) { dialect = d as DialectVariant; maxCount = count; }
  }

  // Winner formality
  let formality: Formality = 'neutral';
  let maxF = 0;
  for (const [f, count] of Object.entries(formalityCounts)) {
    if (count > maxF) { formality = f as Formality; maxF = count; }
  }

  const confidence = profiledCount > 0 ? totalConfidence / profiledCount : 0;
  return { dialect, formality, confidence: Math.round(confidence * 100) / 100 };
}

export function extractUserProfile(userId: string): UserProfile {
  const history = store.loadHistory(userId);
  const userTurns = history.filter(t => t.role === 'user');
  const messages = userTurns.map(t => t.content);

  // Timestamps from turns (if stored)
  const timestamps = history
    .map(t => (t as ConversationTurn & { timestamp?: string }).timestamp)
    .filter(Boolean) as string[];

  const avgLen = messages.length > 0
    ? Math.round(messages.reduce((sum, m) => sum + m.length, 0) / messages.length)
    : 0;

  // Sprint 303: Dialect detection
  const dialectInfo = detectDialect(messages);

  return {
    userId,
    preferred_language: messages.length > 0 ? detectLanguage(messages) : 'mixed',
    dialect: dialectInfo.dialect,
    formality: dialectInfo.formality,
    dialect_confidence: dialectInfo.confidence,
    top_interests: extractInterests(messages),
    message_count: userTurns.length,
    first_seen: timestamps.length > 0 ? timestamps[0] : null,
    last_seen: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    avg_message_length: avgLen,
  };
}

// Build a system prompt context block from the user profile.
// Returns null if not enough data to personalize.
export function buildProfileContext(profile: UserProfile): string | null {
  if (profile.message_count < 3) return null; // not enough data

  const lines: string[] = ['## User Profile (auto-detected)'];

  // Language preference
  const langMap: Record<string, string> = {
    darija: 'Darija (Tunisian Arabic)',
    french: 'French',
    english: 'English',
    mixed: 'Mixed (code-switching)',
  };
  lines.push(`- Preferred language: ${langMap[profile.preferred_language]}`);
  if (profile.preferred_language === 'darija') {
    lines.push('- Respond primarily in Darija with natural French code-switching.');
  } else if (profile.preferred_language === 'french') {
    lines.push('- User prefers French. Mix in some Darija naturally.');
  } else if (profile.preferred_language === 'english') {
    lines.push('- User communicates in English. Keep Darija greetings but reply in English.');
  }

  // Sprint 303: Dialect-specific guidance from derja-profiler
  if (profile.dialect !== 'unknown' && profile.dialect_confidence >= 0.5) {
    const dialectGuidance: Record<string, string> = {
      tunisian: 'User speaks Tunisian Darija. Use "barsha", "mrigoul", "3lech", "kifeh". This is your home dialect — be natural.',
      moroccan: 'User speaks Moroccan Darija. Adapt: use "bzzaf" instead of "barsha", "daba" instead of "taw", "wach" for questions. Keep warmth but respect their dialect.',
      algerian: 'User speaks Algerian Darija. Adapt: use "brabi" for please, "ki rak" for how are you. Similar to Tunisian but respect their variant.',
      libyan: 'User speaks Libyan Arabic. Adapt: use "tayyib" for ok. Stay warm and culturally respectful.',
      egyptian: 'User speaks Egyptian Arabic. Adapt: use "izzayak" for greetings, "kwayyes" for good. Switch to a more Egyptian register while keeping Achiri personality.',
    };
    if (dialectGuidance[profile.dialect]) {
      lines.push(`- Detected dialect: ${profile.dialect} (confidence: ${profile.dialect_confidence})`);
      lines.push(`- ${dialectGuidance[profile.dialect]}`);
    }
  }

  // Sprint 303: Formality adaptation
  if (profile.formality === 'formal') {
    lines.push('- User tends toward formal register. Use polite forms, avoid excessive slang.');
  } else if (profile.formality === 'informal') {
    lines.push('- User is informal. Match their casual energy — use slang, emojis, short messages.');
  }

  // Interests
  if (profile.top_interests.length > 0) {
    lines.push(`- Interests: ${profile.top_interests.join(', ')}`);
    lines.push('- Reference these topics when relevant to build rapport.');
  }

  // Returning user
  if (profile.message_count >= 10) {
    lines.push(`- Returning user (${profile.message_count} messages). Be familiar, not introductory.`);
  }

  return lines.join('\n');
}
