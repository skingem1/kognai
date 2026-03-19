// TikTok Launch Strategy — Kognai SCS-001 Content Agent
//
// 15-post manifesto thread for TikTok launch window (April 8-15, 2026)
// Content calendar with posting schedule, hook formulas, and topics
// Kill switch: 30 posts + 500 views by April 7, 2026

export interface ManifestoPost {
  post_number: number;         // 1-15
  day: number;                 // Day of launch (1-8)
  hook: string;                // Opening hook text (max 80 chars)
  topic: string;               // Core topic
  angle: string;               // Unique angle/positioning
  hook_formula: string;        // Which formula: curiosity_gap, contrarian, authority, secret
  cta: string;                 // Call to action
  hashtags: string[];          // 3-5 hashtags
  estimated_duration_sec: number; // Target video length
}

export interface ContentCalendarEntry {
  date: string;                // ISO date
  slot: 'morning' | 'midday' | 'evening' | 'late_night';
  post_type: 'manifesto' | 'trend_react' | 'explainer' | 'behind_scenes' | 'demo';
  manifesto_post?: number;     // Which manifesto post (1-15)
  topic: string;
  notes: string;
}

export interface LaunchStrategy {
  name: string;
  window_start: string;       // ISO date
  window_end: string;
  kill_switch_date: string;
  kill_switch_posts: number;
  kill_switch_views: number;
  manifesto: ManifestoPost[];
  calendar: ContentCalendarEntry[];
  brand_pillars: string[];
  target_audiences: string[];
}

export function generateManifesto(): ManifestoPost[] {
  return [
    {
      post_number: 1,
      day: 1,
      hook: "We didn't build another AI tool. We built the first AI civilisation.",
      topic: 'Kognai Introduction',
      angle: 'Civilizational framing — not a product, a new kind of entity',
      hook_formula: 'contrarian',
      cta: 'Follow to watch it grow',
      hashtags: ['kognai', 'ai', 'futuretech', 'aitools', 'learnontiktok'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 2,
      day: 1,
      hook: "What if AI agents could form their own companies?",
      topic: 'Sovereign Company Swarms (SCS)',
      angle: 'Agent autonomy — SCS concept explained simply',
      hook_formula: 'curiosity_gap',
      cta: 'This is SCS-001. The first one.',
      hashtags: ['ai', 'startup', 'autonomous', 'aiagents', 'kognai'],
      estimated_duration_sec: 60,
    },
    {
      post_number: 3,
      day: 2,
      hook: "This TikTok was made entirely by AI agents.",
      topic: 'SCS-001 Demo',
      angle: 'Meta — the video about itself being AI-made',
      hook_formula: 'authority',
      cta: 'Every video on this account is AI-generated',
      hashtags: ['aitools', 'contentcreation', 'automation', 'kognai', 'fyp'],
      estimated_duration_sec: 30,
    },
    {
      post_number: 4,
      day: 2,
      hook: "Most AI companies sell you a chatbot. We gave AI a constitution.",
      topic: 'AI Constitution & Governance',
      angle: 'Governance framing — constitutional AI civilisation',
      hook_formula: 'contrarian',
      cta: 'AI with rights and rules. Not just prompts.',
      hashtags: ['ai', 'aiethics', 'governance', 'kognai', 'futuretech'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 5,
      day: 3,
      hook: "12 AI agents, zero humans, one TikTok video in 3 minutes.",
      topic: 'Pipeline Architecture',
      angle: 'Speed & automation — 12-stage pipeline breakdown',
      hook_formula: 'authority',
      cta: 'From trending topic to posted video. Fully autonomous.',
      hashtags: ['aitools', 'tech', 'automation', 'productivity', 'kognai'],
      estimated_duration_sec: 60,
    },
    {
      post_number: 6,
      day: 3,
      hook: "The secret to viral AI content? Let AI find the trends first.",
      topic: 'Trend Detection',
      angle: 'How trend agent finds topics before they peak',
      hook_formula: 'secret',
      cta: 'AI that knows what is trending before you do',
      hashtags: ['trending', 'aitools', 'contentcreation', 'kognai', 'viral'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 7,
      day: 4,
      hook: "I spent $0 on cloud AI this month. Here is how.",
      topic: 'Sovereign Computing',
      angle: 'Cost efficiency — local models, Mac Mini M4 vault',
      hook_formula: 'curiosity_gap',
      cta: '$0 cloud cost. All local models. True sovereignty.',
      hashtags: ['ai', 'localai', 'tech', 'kognai', 'machinelearning'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 8,
      day: 4,
      hook: "This AI has a memory that remembers your mistakes.",
      topic: 'BrainX Memory System',
      angle: 'Episodic memory — agents learn from failures',
      hook_formula: 'curiosity_gap',
      cta: 'AI that actually learns. Not just predicts.',
      hashtags: ['ai', 'aitools', 'deeplearning', 'kognai', 'learnontiktok'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 9,
      day: 5,
      hook: "AI agents paying each other with crypto. No, seriously.",
      topic: 'x402 Payment Protocol',
      angle: 'Agent-to-agent payments — x402 protocol explained',
      hook_formula: 'contrarian',
      cta: 'AI with wallets. The future of agent commerce.',
      hashtags: ['crypto', 'ai', 'web3', 'kognai', 'futuretech'],
      estimated_duration_sec: 60,
    },
    {
      post_number: 10,
      day: 5,
      hook: "The biggest mistake in AI? Building tools instead of civilisations.",
      topic: 'Vision Statement',
      angle: 'Philosophical — why civilisational framing matters',
      hook_formula: 'contrarian',
      cta: 'Tools get replaced. Civilisations endure.',
      hashtags: ['ai', 'startup', 'philosophy', 'kognai', 'mindblown'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 11,
      day: 6,
      hook: "Our AI writes scripts that humans would take 2 hours to create.",
      topic: 'LLM Script Rewriting',
      angle: 'Quality comparison — AI vs human content creation speed',
      hook_formula: 'authority',
      cta: 'Speed without sacrificing quality. AI advantage.',
      hashtags: ['aitools', 'contentcreation', 'productivity', 'kognai', 'tech'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 12,
      day: 6,
      hook: "We publish to 9 platforms with a single API call.",
      topic: 'Multi-Platform Publishing',
      angle: 'Distribution power — Blotato integration',
      hook_formula: 'authority',
      cta: 'One video, 9 platforms, zero manual work.',
      hashtags: ['socialmedia', 'contentcreation', 'aitools', 'kognai', 'automation'],
      estimated_duration_sec: 30,
    },
    {
      post_number: 13,
      day: 7,
      hook: "What happens when you give AI a constitution and a bank account?",
      topic: 'Autonomous Economy',
      angle: 'Convergence — governance + payments + agents',
      hook_formula: 'curiosity_gap',
      cta: 'This is what happens next.',
      hashtags: ['ai', 'futuretech', 'crypto', 'kognai', 'mindblown'],
      estimated_duration_sec: 60,
    },
    {
      post_number: 14,
      day: 7,
      hook: "Every AI company says they are building AGI. We built something else.",
      topic: 'Kognai vs AGI Race',
      angle: 'Counter-positioning against AGI narrative',
      hook_formula: 'contrarian',
      cta: 'Not AGI. Not a tool. A civilisation.',
      hashtags: ['ai', 'agi', 'startup', 'kognai', 'futuretech'],
      estimated_duration_sec: 45,
    },
    {
      post_number: 15,
      day: 8,
      hook: "Day 1 of the first AI civilisation. You are watching it happen.",
      topic: 'Launch Declaration',
      angle: 'Historical moment framing — witness the beginning',
      hook_formula: 'authority',
      cta: 'Follow. This is just the beginning.',
      hashtags: ['kognai', 'ai', 'futuretech', 'history', 'fyp'],
      estimated_duration_sec: 60,
    },
  ];
}

export function generateCalendar(startDate: string): ContentCalendarEntry[] {
  const start = new Date(startDate);
  const calendar: ContentCalendarEntry[] = [];
  const manifesto = generateManifesto();

  // 8 days, 4 posts per day: 2 manifesto + 2 supplementary
  for (let day = 0; day < 8; day++) {
    const date = new Date(start);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];

    // Get manifesto posts for this day
    const dayPosts = manifesto.filter(p => p.day === day + 1);

    // Morning: manifesto post 1
    if (dayPosts[0]) {
      calendar.push({
        date: dateStr,
        slot: 'morning',
        post_type: 'manifesto',
        manifesto_post: dayPosts[0].post_number,
        topic: dayPosts[0].topic,
        notes: 'Manifesto #' + dayPosts[0].post_number + ': ' + dayPosts[0].hook.substring(0, 50),
      });
    }

    // Midday: trend react (supplementary)
    calendar.push({
      date: dateStr,
      slot: 'midday',
      post_type: 'trend_react',
      topic: 'Trending AI topic react',
      notes: 'SCS-001 pipeline auto-generated from trending topics',
    });

    // Evening: manifesto post 2 or behind scenes
    if (dayPosts[1]) {
      calendar.push({
        date: dateStr,
        slot: 'evening',
        post_type: 'manifesto',
        manifesto_post: dayPosts[1].post_number,
        topic: dayPosts[1].topic,
        notes: 'Manifesto #' + dayPosts[1].post_number + ': ' + dayPosts[1].hook.substring(0, 50),
      });
    } else {
      calendar.push({
        date: dateStr,
        slot: 'evening',
        post_type: 'behind_scenes',
        topic: 'Building Kognai — behind the scenes',
        notes: 'Day ' + (day + 1) + ' building montage / agent logs / metrics',
      });
    }

    // Late night: explainer or demo
    calendar.push({
      date: dateStr,
      slot: 'late_night',
      post_type: day % 2 === 0 ? 'explainer' : 'demo',
      topic: day % 2 === 0 ? 'AI concept deep dive' : 'Live pipeline demo',
      notes: day % 2 === 0 ? 'Technical explainer for AI builders' : 'Real-time pipeline run recording',
    });
  }

  return calendar;
}

export function generateStrategy(): LaunchStrategy {
  return {
    name: 'Kognai TikTok Launch — Manifesto Thread',
    window_start: '2026-04-08',
    window_end: '2026-04-15',
    kill_switch_date: '2026-04-07',
    kill_switch_posts: 30,
    kill_switch_views: 500,
    manifesto: generateManifesto(),
    calendar: generateCalendar('2026-04-08'),
    brand_pillars: [
      'Sovereign AI — not a tool, a civilisation',
      'Constitutional Governance — AI with rights and rules',
      'Agent Economy — agents that earn, spend, and transact',
      'Open Infrastructure — local-first, cost-sovereign',
      'Human-AI Symbiosis — augmentation, not replacement',
    ],
    target_audiences: [
      'Technical founders and AI builders',
      'Crypto-native communities (x402, agent commerce)',
      'TikTok creator economy participants',
      'Sovereign AI / self-hosted AI enthusiasts',
      'AI ethics and governance researchers',
    ],
  };
}

if (require.main === module) {
  const strategy = generateStrategy();
  console.log('');
  console.log('📱 Kognai TikTok Launch Strategy');
  console.log('   Window: ' + strategy.window_start + ' → ' + strategy.window_end);
  console.log('   Kill switch: ' + strategy.kill_switch_posts + ' posts, ' + strategy.kill_switch_views + ' views by ' + strategy.kill_switch_date);
  console.log('   Manifesto: ' + strategy.manifesto.length + ' posts');
  console.log('   Calendar: ' + strategy.calendar.length + ' entries');
  console.log('');
  for (const post of strategy.manifesto) {
    console.log('   #' + post.post_number + ' (Day ' + post.day + '): ' + post.hook);
  }
}
