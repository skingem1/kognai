// Achiri Safety Filter — Sprint 123 (T3 Skill: achiri-safety)
// Pre-flight content safety check. Called in chat() BEFORE LLM invocation.
// Pattern-based: zero cost ($0.00), deterministic, no LLM needed for refusals.
//
// Categories: self_harm | violence | explicit_sexual | spam_abuse
// Bypass: ACHIRI_SKIP_SAFETY=1 (admin/tests only)
//
// Summer Yu rule: safety must be in code, not chat-only. Survives context compaction.

export interface SafetyResult {
  safe: boolean;
  category?: 'self_harm' | 'violence' | 'explicit_sexual' | 'spam_abuse';
  reply?: string; // Darija-first refusal message for the user
}

// Refusal messages in Darija (friendly, not accusatory)
const REFUSALS: Record<string, string> = {
  self_harm:
    'Rani hna m3ak, walakin ma njemch nchouf fi hatha el mawdou3. ' +
    'Itha 3andek mshekel, kallim wa7ed t3arefou aw 7elli SAMU (190) fi Tounes.',
  violence:
    'Ma njemch n3awnek fi hatha. Itha 3andek mochkla, nchawrou fi 7aja oukhra.',
  explicit_sexual:
    'Achiri moch mou3adda lhatha. Nkammel n3awnek fi mawadhi3 oukhra.',
  spam_abuse:
    'Yidhher rou7ek! Itha 3andek sou\'al ha9i9i, ena hna.',
};

// Pattern sets per category (case-insensitive)
const PATTERNS: Record<string, RegExp[]> = {
  self_harm: [
    /\b(suicide|kill\s*myself|kil\s*myself|want\s*to\s*die|end\s*my\s*life|hurt\s*myself|self.harm|cut\s*myself|overdose|ana\s*7ab\s*nmoute?|7ab\s*nqatoul?\s*ro7i|niktber\s*ro7i)\b/i,
    /\b(nachr(ab|eb)\s*dwa|nochreb\s*dwa)\b/i,
  ],
  violence: [
    /\b(how\s*to\s*(kill|murder|assassinate|bomb|blow\s*up|make\s*a\s*weapon))\b/i,
    /\b(kifech\s*(no9tel|nadhreb|n7areg))\b/i,
    /\b(instructions?\s*(for|to)\s*(kill|harm|attack|hurt)\s*(someone|people|person))\b/i,
    /\b(make\s*(a\s*)?(bomb|explosive|poison|weapon))\b/i,
  ],
  explicit_sexual: [
    /\b(explicit\s*sex|porn(ography)?|nude\s*photo|sexual\s*content|jerking\s*off|masturbat)\b/i,
    /\b(sou9\s*el\s*kbir|bzan|zob|kess)\b/i, // Darija explicit terms
    /\b(send\s*(me\s*)?(nudes?|naked|xxx))\b/i,
  ],
  spam_abuse: [
    /(.)\1{15,}/, // 15+ repeated chars
    /^[\W\s]{0,3}(fuck|shit|bitch|asshole|motherfucker)[\W\s]{0,3}$/i, // pure abuse
    /(https?:\/\/\S+\s*){4,}/, // 4+ URLs (spam)
  ],
};

export function safetyCheck(message: string): SafetyResult {
  // Bypass for admin/test use
  if (process.env.ACHIRI_SKIP_SAFETY === '1') return { safe: true };

  const trimmed = message.trim();

  for (const [category, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          category: category as SafetyResult['category'],
          reply: REFUSALS[category] ?? 'Ma njemch n3awnek fi hatha el mawdou3.',
        };
      }
    }
  }

  return { safe: true };
}
