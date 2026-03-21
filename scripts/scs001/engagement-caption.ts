// Sprint 424: Shared engagement caption module
// Sprint 426: Trending hashtag injection + speaker description variations
// Used by: telegram-bot, posting-auto-deliver, posting-reminder, morning-caption-push
// Hook-based opening lines, CTAs, niche hashtags (Sprint 418 format)

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const HOOK_TEMPLATES: Record<string, string[]> = {
  curiosity_gap: [
    'Wait for it... this changes everything',
    'Nobody is talking about this yet',
    'This is the part they don\'t teach you',
    'I wasn\'t ready for this',
    'Watch till the end, trust me',
  ],
  secret: [
    'The secret nobody wants you to know',
    'They really don\'t want this going viral',
    'This wasn\'t supposed to get out',
    'Here\'s what they\'re hiding from you',
    'Most people will never know this',
  ],
  contrarian: [
    'Everyone is wrong about this',
    'Unpopular opinion but hear me out',
    'This might be controversial but...',
    'Hot take: everything you know is wrong',
    'I\'m about to upset a lot of people',
  ],
  authority: [
    'Expert drops a truth bomb',
    'Years of experience in 60 seconds',
    'This is what the pros actually do',
    'Finally someone explains this properly',
    'Listen to someone who actually knows',
  ],
  // Sprint 443: New hook formulas for content diversity
  story: [
    'I just found out something that blew my mind',
    'This story will change how you see everything',
    'You won\'t believe what happened next',
    'Let me tell you something incredible',
    'The craziest thing just happened in tech',
  ],
  question: [
    'Can you guess what this actually does?',
    'What would you do with this technology?',
    'Did you know this was even possible?',
    'Why is nobody asking this question?',
    'Is this the future or just hype?',
  ],
  urgency: [
    'This changes everything starting NOW',
    'You need to know this before it\'s too late',
    'This is happening right now and most people are clueless',
    'In 5 years you\'ll wish you saw this today',
    'The clock is ticking on this one',
  ],
  proof: [
    '97% of people get this wrong',
    'This one fact changes the entire game',
    'The numbers don\'t lie — look at this',
    'After 1000 hours of research, here\'s the truth',
    'Here\'s proof that everything is about to change',
  ],
};

export const ENGAGEMENT_CTAS = [
  'Follow for daily tech insights',
  'Save this for later',
  'Drop a comment if you agree',
  'Share this with someone who needs it',
  'Follow for more mind-blowing tech',
  // Sprint 443: New CTAs for diversity
  'Tag someone who needs to see this',
  'Bookmark this before it disappears',
  'What do you think? Comment below',
  'Follow for the stuff they don\'t teach you',
  'Double tap if this blew your mind',
];

// Sprint 426: Speaker description variations (replaces static "explains it all")
const SPEAKER_DESCRIPTIONS = [
  '{speaker} just dropped this',
  '{speaker} breaks it down in 60 seconds',
  'Hear it from {speaker}',
  '{speaker} explains it all',
  '{speaker} with a hot take',
  '{speaker} — this is a must-watch',
  'What {speaker} just said changes everything',
];

export const NICHE_TAGS: Record<string, string[]> = {
  ai: ['#artificialintelligence', '#machinelearning', '#deeplearning', '#chatgpt', '#airevolution'],
  tech: ['#technology', '#innovation', '#futuretech', '#techtrends', '#digitaltransformation'],
  coding: ['#programming', '#developer', '#coding', '#software', '#webdev'],
  science: ['#science', '#research', '#discovery', '#stem', '#education'],
};

/** Deterministic hash for consistent caption per video_id */
function hashVideoId(videoId: string): number {
  return videoId.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
}

// Sprint 426 + 667: Load trending topics from viral-topics.json for hashtag injection
// Sprint 667: Prefer enriched `trending` titles from radar consolidation
function loadTrendingHashtags(): string[] {
  try {
    const topicsPath = join(process.cwd(), 'workspace', 'scs001', 'viral-topics.json');
    if (!existsSync(topicsPath)) return [];
    const data = JSON.parse(readFileSync(topicsPath, 'utf-8'));

    // Sprint 667: Extract hashtags from enriched trending titles (better signal)
    if (Array.isArray(data.trending) && data.trending.length > 0) {
      const stop = new Set(['the', 'and', 'for', 'you', 'with', 'that', 'this', 'from', 'your', 'make', 'any', 'how', 'why', 'what', 'top', 'need', 'know', 'tool', 'tools', 'open', 'source', 'runtime', 'universal']);
      const tags: string[] = [];
      for (const t of data.trending.slice(0, 5)) {
        // Extract first meaningful word (product/project name)
        const title = (t.title ?? '').split(/\s*[—–\-:\/]\s*/)[0].trim();
        const words = title.toLowerCase()
          .replace(/[^a-z\s]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length >= 3 && !stop.has(w));
        if (words.length > 0) {
          tags.push('#' + words[0]);
        }
      }
      if (tags.length > 0) return [...new Set(tags)].filter(t => t.length > 3).slice(0, 5);
    }

    // Fallback: legacy keyword topics
    const topics: string[] = Array.isArray(data.topics) ? data.topics : [];
    return topics
      .slice(0, 5)
      .map(t => '#' + t.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length > 2);
  } catch { return []; }
}

/** Build an engagement-optimized TikTok caption */
export function buildEngagementCaption(opts: {
  videoId: string;
  hookFormula?: string | null;
  speaker?: string | null;
  topic?: string | null;
  extraHashtags?: string[];
}): string {
  const hook = opts.hookFormula && opts.hookFormula !== 'unknown' ? opts.hookFormula : 'curiosity_gap';
  const templates = HOOK_TEMPLATES[hook] ?? HOOK_TEMPLATES.curiosity_gap;
  const h = hashVideoId(opts.videoId);
  const hookLine = templates[Math.abs(h) % templates.length];
  const cta = ENGAGEMENT_CTAS[Math.abs(h >> 3) % ENGAGEMENT_CTAS.length];

  // Niche-specific tags from topic
  const topicLower = (opts.topic ?? '').toLowerCase();
  let nicheTags: string[] = [];
  for (const [key, tags] of Object.entries(NICHE_TAGS)) {
    if (topicLower.includes(key)) { nicheTags = tags.slice(0, 3); break; }
  }
  if (nicheTags.length === 0) nicheTags = NICHE_TAGS.ai.slice(0, 3);

  // Sprint 426: Inject trending topic hashtags
  const trendingTags = loadTrendingHashtags();

  const baseTags = ['#fyp', '#viral', '#learnontiktok'];
  const tagSet: Record<string, boolean> = {};
  for (const t of [...nicheTags, ...trendingTags, ...(opts.extraHashtags ?? []), ...baseTags]) tagSet[t] = true;
  const allTags = Object.keys(tagSet).slice(0, 12);

  const lines: string[] = [hookLine, ''];
  if (opts.speaker && opts.speaker !== 'unknown') {
    // Sprint 426: Deterministic speaker description variation
    const desc = SPEAKER_DESCRIPTIONS[Math.abs(h >> 5) % SPEAKER_DESCRIPTIONS.length];
    lines.push(desc.replace('{speaker}', opts.speaker));
    lines.push('');
  }
  lines.push(cta);
  lines.push('');
  lines.push(allTags.join(' '));

  return lines.join('\n');
}
