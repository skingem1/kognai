// Achiri Topic Suggester — Sprint 309
// Detects conversation stalls (short/vague messages) and suggests topics
// based on the user's profile interests. Zero LLM cost ($0.00).
//
// Called in chat() when user message is short and vague.
// Returns a system prompt hint with topic suggestions.

import type { UserProfile } from './user-profile';

// Patterns that indicate a conversation stall
const STALL_PATTERNS = [
  /^(bored|s'ennuie|ennui|ma3andi\s*ma\s*na3mel|idk|dunno|meh|bleh|hmm+|ok+|hm|mhm|lol|xd|haha|k|kk|nothing|rien|walou|walo)\.?!?$/i,
  /^(i\s*don'?t\s*know|je\s*sais\s*pas|ma\s*na3rech|chna3mel|what\s*should\s*i\s*do|que\s*faire)[\?\.]?$/i,
  /^(hey|hi|yo|aslema|salut|coucou|bonjour|salam)\.?!?$/i,
  /^\.+$/,  // Just dots
];

// Maximum message length to consider as a potential stall
const MAX_STALL_LENGTH = 40;

// Topic suggestions per interest category (Darija + French + English flavored)
const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  education: [
    'Tell me about something interesting you learned recently',
    'Chnowa el mawdou3 li 9a3d ta9rah tawa?',
    'Want me to quiz you on something for fun?',
  ],
  technology: [
    'Cheft chi app jdida interesting?',
    'Want to brainstorm a project idea together?',
    'Tell me about a cool tech thing you saw recently',
  ],
  health: [
    'Kifech el sa7a el yawm? Sport walla relaxation?',
    'Habbit ntakmlou 3la tips mta3 sleep walla stress?',
    'Want some quick workout ideas?',
  ],
  relationships: [
    'Kifech as-7abek? Famma chi news?',
    'Habbit ta7ki 3la chi 7ad important fi 7yatek?',
    'Tell me something good that happened with someone lately',
  ],
  work: [
    'Kifech el khedma? Chi challenge jdid?',
    'Want to brainstorm about a work problem?',
    'Tell me what motivates you about your work',
  ],
  culture: [
    'Cheft chi film walla serie mlih dernièrement?',
    'Tnajjem tqolli 3la chi musique t7ebha?',
    'Tell me about a place in Tunisia you love',
  ],
  food: [
    'Chnowa a7san plat klit had el jom3a?',
    'Habbit na3tiik recette facile w bnina?',
    'Tell me your favorite Tunisian dish and why',
  ],
  religion: [
    'Famma chi aya walla hadith inspire you dernièrement?',
    'Habbit ntakmlou 3la chi mawdou3 spirituel?',
  ],
};

// Default suggestions when no interests are known
const DEFAULT_SUGGESTIONS = [
  'Chnowa a7san 7aja saret-lek el yawm?',
  'Itha tjik chance tsafer, win tmchi?',
  'Tell me something about yourself — I want to know you better!',
  'Chnowa el 7aja li ta3mel-ha ki t7ess rou7ek bored?',
];

/**
 * Check if a message indicates a conversation stall.
 */
export function isStallMessage(message: string): boolean {
  if (message.length > MAX_STALL_LENGTH) return false;
  const trimmed = message.trim();
  if (trimmed.length === 0) return true;
  return STALL_PATTERNS.some(p => p.test(trimmed));
}

/**
 * Generate topic suggestions based on user interests.
 * Returns 2-3 suggestions from their interests, or defaults.
 */
export function suggestTopics(profile: UserProfile | null): string[] {
  if (!profile || profile.top_interests.length === 0) {
    // Shuffle and pick 2 from defaults
    const shuffled = [...DEFAULT_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }

  const suggestions: string[] = [];
  for (const interest of profile.top_interests.slice(0, 3)) {
    const pool = TOPIC_SUGGESTIONS[interest];
    if (pool && pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!suggestions.includes(pick)) suggestions.push(pick);
    }
  }

  // Fill with defaults if not enough
  if (suggestions.length < 2) {
    const shuffled = [...DEFAULT_SUGGESTIONS].sort(() => Math.random() - 0.5);
    for (const s of shuffled) {
      if (suggestions.length >= 2) break;
      if (!suggestions.includes(s)) suggestions.push(s);
    }
  }

  return suggestions.slice(0, 3);
}

/**
 * Build system prompt hint for topic suggestions.
 * Returns empty string if not a stall message.
 */
export function buildTopicHint(message: string, profile: UserProfile | null): string {
  if (!isStallMessage(message)) return '';

  const topics = suggestTopics(profile);
  if (topics.length === 0) return '';

  return [
    '## Conversation Engagement',
    'The user seems bored or unsure what to talk about. Don\'t just say "ok" back.',
    'Naturally steer the conversation to something interesting. Suggested topics:',
    ...topics.map(t => '- ' + t),
    '',
    'Pick ONE and work it in naturally. Be playful and curious, not pushy.',
  ].join('\n');
}
