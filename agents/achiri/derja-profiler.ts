// Achiri Derja Profiler — Sprint 125 (T3 Skill: derja-profiler)
// Detects Darija dialect variant and formality level from user message.
// Pattern-based, $0.00 (no LLM call needed).
//
// Dialect variants: tunisian | moroccan | algerian | libyan | egyptian | unknown
// Formality: informal | neutral | formal
//
// Used by Achiri to adapt code-switching and cultural references.
// Tunisian users → stay Tunisian Darija. Moroccan/Algerian → partial adaptation.

export type DialectVariant = 'tunisian' | 'moroccan' | 'algerian' | 'libyan' | 'egyptian' | 'unknown';
export type Formality = 'informal' | 'neutral' | 'formal';

export interface DerjaProfile {
  dialect: DialectVariant;
  formality: Formality;
  confidence: number;  // 0.0 - 1.0
  features: string[]; // detected markers that drove the result
}

// --- Dialect marker sets ---
// Each entry: [pattern, feature_label]

type MarkerSet = Array<[RegExp, string]>;

const TUNISIAN_MARKERS: MarkerSet = [
  [/\bbarsha\b/i, 'TN:barsha(a lot)'],
  [/\byasser\b/i, 'TN:yasser(yes)'],
  [/\bwalakin\b/i, 'TN:walakin(but)'],
  [/\bmrigoul\b/i, 'TN:mrigoul(cool/ok)'],
  [/\bmazel\b/i, 'TN:mazel(still)'],
  [/\b7raya\b/i, 'TN:7raya(hot/spicy)'],
  [/\bbnadem\b/i, 'TN:bnadem(person)'],
  [/\b3lech\b/i, 'TN:3lech(why)'],
  [/\bkifeh\b/i, 'TN:kifeh(how)'],
  [/\bnashrob\b|\bnochreb\b/i, 'TN:nochreb(drink)'],
  [/\byezzi\b/i, 'TN:yezzi(enough)'],
  [/\bwa9tech\b|\bwaqtesh\b/i, 'TN:wa9tech(when)'],
  [/\btounes\b/i, 'TN:tounes(Tunisia)'],
  [/\bmshekel\b/i, 'TN:mshekel(problem)'],
  [/\bma3lich\b/i, 'TN:ma3lich(it\'s fine)'],
];

const MOROCCAN_MARKERS: MarkerSet = [
  [/\bzwina?\b/i, 'MA:zwina(beautiful)'],
  [/\bbzzaf\b/i, 'MA:bzzaf(a lot)'],
  [/\bdaba\b/i, 'MA:daba(now)'],
  [/\bkayn\b/i, 'MA:kayn(there is)'],
  [/\bwach\b/i, 'MA:wach(is it?)'],
  [/\bsahbi\b/i, 'MA:sahbi(my friend)'],
  [/\bmazal\b/i, 'MA:mazal(still)'],
  [/\bkhoya\b/i, 'MA:khoya(my brother)'],
  [/\bsmiya\b/i, 'MA:smiya(name)'],
  [/\bweldi\b/i, 'MA:weldi(my son)'],
];

const ALGERIAN_MARKERS: MarkerSet = [
  [/\brahi\b/i, 'DZ:rahi(is/there is)'],
  [/\bwach\b.*\bwach\b/i, 'DZ:wach-wach(double)'],
  [/\bbrabi\b/i, 'DZ:brabi(please)'],
  [/\bki\s+rak\b/i, 'DZ:ki rak(how are you)'],
  [/\bntaya\b/i, 'DZ:ntaya(you)'],
  [/\byakhi\b/i, 'DZ:yakhi(isn\'t it)'],
  [/\bnta3\b/i, 'DZ:nta3(of/belonging to)'],
  [/\bdzayer\b/i, 'DZ:dzayer(Algeria)'],
];

const LIBYAN_MARKERS: MarkerSet = [
  [/\bnash\b/i, 'LY:nash(how)'],
  [/\babukum\b/i, 'LY:abukum(your father)'],
  [/\btayyib\b/i, 'LY:tayyib(good/ok)'],
  [/\bwarak\b/i, 'LY:warak(behind you)'],
  [/\btrabuls\b/i, 'LY:trabuls(Tripoli)'],
];

const EGYPTIAN_MARKERS: MarkerSet = [
  [/\bizzayak\b/i, 'EG:izzayak(how are you)'],
  [/\b3amil\s+eh\b/i, 'EG:3amil eh(what\'s up)'],
  [/\bmashy\b/i, 'EG:mashy(ok/walking)'],
  [/\bkwayyes\b/i, 'EG:kwayyes(good)'],
  [/\bmasr\b/i, 'EG:masr(Egypt)'],
  [/\bfein\b/i, 'EG:fein(where)'],
  [/\bahsan\b/i, 'EG:ahsan(better)'],
];

// Formality indicators
const INFORMAL_MARKERS: RegExp[] = [
  /[379]/, // Darija numeral substitutions
  /\b(lol|haha|hh+|😂|😊|😄|🙏|💪)/ui,
  /[!?]{2,}/, // multiple punctuation
  /\b(wlah|wallah|inchallah|hamdullah)\b/i,
];

const FORMAL_MARKERS: RegExp[] = [
  /(أنا|أنت|هو|هي|نحن|هم)/, // MSA pronouns (no \b — Arabic Unicode)
  /(السيد|السيدة|حضرتك|تفضل|المحترم|أرغب|الاستفسار)/, // formal Arabic titles/vocab
  /\b(monsieur|madame|veuillez|cordialement)\b/i, // formal French
  /\b(sincerely|dear\s+sir|dear\s+madam|respectfully)\b/i,
];

function matchMarkers(text: string, markers: MarkerSet): { count: number; features: string[] } {
  const features: string[] = [];
  let count = 0;
  for (const [pattern, label] of markers) {
    if (pattern.test(text)) {
      count++;
      features.push(label);
    }
  }
  return { count, features };
}

export function profileMessage(text: string): DerjaProfile {
  const features: string[] = [];

  // --- Dialect scoring ---
  const tn = matchMarkers(text, TUNISIAN_MARKERS);
  const ma = matchMarkers(text, MOROCCAN_MARKERS);
  const dz = matchMarkers(text, ALGERIAN_MARKERS);
  const ly = matchMarkers(text, LIBYAN_MARKERS);
  const eg = matchMarkers(text, EGYPTIAN_MARKERS);

  const scores: Record<DialectVariant, number> = {
    tunisian: tn.count,
    moroccan: ma.count,
    algerian: dz.count,
    libyan:   ly.count,
    egyptian: eg.count,
    unknown:  0,
  };

  const allFeatures = [...tn.features, ...ma.features, ...dz.features, ...ly.features, ...eg.features];
  features.push(...allFeatures);

  // Determine winner
  const maxScore = Math.max(tn.count, ma.count, dz.count, ly.count, eg.count);
  let dialect: DialectVariant = 'unknown';
  let confidence = 0;

  if (maxScore > 0) {
    const winner = Object.entries(scores)
      .filter(([k]) => k !== 'unknown')
      .sort((a, b) => b[1] - a[1])[0];
    dialect = winner[0] as DialectVariant;
    // Confidence: 1 match = 0.6, 2 = 0.75, 3+ = 0.9
    confidence = maxScore >= 3 ? 0.9 : maxScore === 2 ? 0.75 : 0.6;
    // Penalize if two dialects tie
    const topTwo = Object.values(scores).filter(s => s === maxScore).length;
    if (topTwo > 1) confidence *= 0.7;
  }

  // --- Formality scoring ---
  let informalCount = 0;
  let formalCount = 0;

  for (const p of INFORMAL_MARKERS) {
    if (p.test(text)) {
      informalCount++;
      features.push('informal_marker');
    }
  }
  for (const p of FORMAL_MARKERS) {
    if (p.test(text)) {
      formalCount++;
      features.push('formal_marker');
    }
  }

  let formality: Formality = 'neutral';
  if (informalCount > formalCount) formality = 'informal';
  else if (formalCount > informalCount) formality = 'formal';

  return { dialect, formality, confidence, features };
}
