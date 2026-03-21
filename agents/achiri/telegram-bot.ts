// Achiri Telegram Bot — Sprint 352
// User-facing chat interface for Achiri alpha launch.
// Bridges Telegram messages → AchiriConversationHandler.chat() → Telegram reply.
// Separate from operator bot (scripts/telegram-bot.ts).
// Env: ACHIRI_TELEGRAM_BOT_TOKEN (required), ACHIRI_ALLOWED_CHAT_IDS (optional CSV whitelist)

import * as fs from 'fs';
import * as path from 'path';
import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from './index';
import { AchiriMemoryStore } from './memory-store';
import { extractUserProfile } from './user-profile';
import { loadSummary } from './conversation-summary';
import { createCheckoutUrl } from './paymee';

const BOT_TOKEN = process.env.ACHIRI_TELEGRAM_BOT_TOKEN || '';
if (!BOT_TOKEN) {
  console.error('[Achiri-TG] ACHIRI_TELEGRAM_BOT_TOKEN not set');
  process.exit(0);
}

const ALLOWED_IDS = (process.env.ACHIRI_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const WAITLIST_PATH = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'waitlist.jsonl');
const REFERRALS_PATH = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'referrals.jsonl');
const OFFSET_PATH = path.join(__dirname, '..', '..', 'data', 'achiri-bot-offset.txt');

// --- Telegram API helpers ---

const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tgApi(method: string, body?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${TG_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`TG API ${method} failed: ${res.status}`);
  const data = await res.json() as { ok: boolean; result: any };
  if (!data.ok) throw new Error(`TG API ${method} error`);
  return data.result;
}

async function sendMessage(chatId: string, text: string): Promise<void> {
  // Telegram max 4096 chars per message
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4000));
    remaining = remaining.slice(4000);
  }
  for (const chunk of chunks) {
    await tgApi('sendMessage', { chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
      .catch(() => tgApi('sendMessage', { chat_id: chatId, text: chunk })); // fallback without Markdown
  }
}

async function getUpdates(offset: number): Promise<any[]> {
  const data = await tgApi('getUpdates', { offset, timeout: 30 });
  return data as any[];
}

// --- Offset persistence ---

function loadOffset(): number {
  try { return parseInt(fs.readFileSync(OFFSET_PATH, 'utf-8').trim(), 10) || 0; } catch { return 0; }
}

function saveOffset(offset: number): void {
  const dir = path.dirname(OFFSET_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OFFSET_PATH, String(offset), 'utf-8');
}

// --- Waitlist management ---

function isOnWaitlist(chatId: string): boolean {
  if (!fs.existsSync(WAITLIST_PATH)) return false;
  const lines = fs.readFileSync(WAITLIST_PATH, 'utf-8').split('\n').filter(l => l.trim());
  return lines.some(l => { try { return JSON.parse(l).chatId === chatId; } catch { return false; } });
}

function addToWaitlist(chatId: string, firstName: string, username: string): void {
  const entry = { chatId, firstName, username, joinedAt: new Date().toISOString() };
  fs.appendFileSync(WAITLIST_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

// --- Sprint 403: Referral tracking ---

interface Referral {
  referrer_id: string;
  referred_id: string;
  referred_name: string;
  referred_username: string;
  timestamp: string;
}

function recordReferral(referrerId: string, referredId: string, referredName: string, referredUsername: string): void {
  // Don't record self-referrals or duplicates
  if (referrerId === referredId) return;
  const existing = loadReferrals();
  if (existing.some(r => r.referred_id === referredId)) return;
  const entry: Referral = { referrer_id: referrerId, referred_id: referredId, referred_name: referredName, referred_username: referredUsername, timestamp: new Date().toISOString() };
  const dir = path.dirname(REFERRALS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(REFERRALS_PATH, JSON.stringify(entry) + '\n', 'utf-8');
}

function loadReferrals(): Referral[] {
  if (!fs.existsSync(REFERRALS_PATH)) return [];
  return fs.readFileSync(REFERRALS_PATH, 'utf-8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function getReferralCount(chatId: string): number {
  return loadReferrals().filter(r => r.referrer_id === chatId).length;
}

// --- Access control ---

function hasAccess(chatId: string): boolean {
  // If no whitelist configured, allow all (open alpha)
  if (ALLOWED_IDS.length === 0) return true;
  return ALLOWED_IDS.includes(chatId);
}

// --- Handler cache ---

const handlers = new Map<string, AchiriConversationHandler>();

function getHandler(chatId: string): AchiriConversationHandler {
  if (!handlers.has(chatId)) {
    // Default: free tier. Premium tiers require upgrade via /upgrade.
    handlers.set(chatId, new AchiriConversationHandler('free', chatId));
    // Evict oldest if cache too large
    if (handlers.size > 200) {
      const oldest = handlers.keys().next().value;
      if (oldest) handlers.delete(oldest);
    }
  }
  return handlers.get(chatId)!;
}

// --- Command handling ---

async function handleStart(chatId: string, firstName: string, username: string, args: string = ''): Promise<void> {
  if (!isOnWaitlist(chatId)) {
    addToWaitlist(chatId, firstName, username);
  }

  // Sprint 403: Process referral parameter (e.g. /start ref_12345)
  if (args.startsWith('ref_')) {
    const referrerId = args.slice(4);
    if (referrerId && referrerId !== chatId) {
      recordReferral(referrerId, chatId, firstName, username);
      // Notify referrer
      const refCount = getReferralCount(referrerId);
      sendMessage(referrerId,
        `🎉 *${firstName}* joined Achiri through your invite link!\n` +
        `📊 You've referred *${refCount}* friend${refCount !== 1 ? 's' : ''} so far. Ya3ichek! 🤝`
      ).catch(() => {}); // non-fatal
    }
  }

  await sendMessage(chatId,
    `مرحبا ${firstName}! 🇹🇳\n\n` +
    `أنا *Achiri* — رفيقك الذكي، مصنوع لتونس.\n` +
    `I'm Achiri — your AI companion, made for Tunisia.\n\n` +
    `أحكيلي شنوة تحب — بالدارجة، بالفرنسوية، ولا بالإنقليزية.\n` +
    `Talk to me in Darija, French, or English — whatever feels natural.\n\n` +
    `ابدأ بإنك تقولي أي حاجة! 💬`
  );
}

async function handleHelp(chatId: string): Promise<void> {
  await sendMessage(chatId,
    `*Achiri Commands*\n\n` +
    `/start — Welcome message\n` +
    `/help — This message\n` +
    `/clear — Clear conversation history\n` +
    `/lang — Switch language preference\n` +
    `/mood — Mood check-in\n` +
    `/quiz — Tunisia trivia\n` +
    `/tip — Daily Tunisian wisdom\n` +
    `/stats — Your engagement stats\n` +
    `/learn — Learn Darija word of the day\n` +
    `/translate — Darija/French/English translator\n` +
    `/memory — See what Achiri remembers about you\n` +
    `/invite — Share Achiri with friends\n` +
    `/upgrade — Upgrade to paid tier\n` +
    `/feedback — Send us feedback\n` +
    `/about — About Achiri\n\n` +
    `Or just send me a message and we'll chat! 💬`
  );
}

async function handleClear(chatId: string): Promise<void> {
  const handler = getHandler(chatId);
  handler.clearMemory(chatId);
  handlers.delete(chatId); // fresh handler next time
  await sendMessage(chatId, '🗑️ Conversation history cleared. Bnédi min jdid! (Fresh start!)');
}

// Sprint 355: /lang — language preference switch
const LANG_PREFS_PATH = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'lang-prefs.json');

function loadLangPrefs(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(LANG_PREFS_PATH, 'utf-8')); } catch { return {}; }
}

function saveLangPref(chatId: string, lang: string): void {
  const prefs = loadLangPrefs();
  prefs[chatId] = lang;
  const dir = path.dirname(LANG_PREFS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LANG_PREFS_PATH, JSON.stringify(prefs, null, 2), 'utf-8');
}

async function handleLang(chatId: string, args: string): Promise<void> {
  const lang = args.toLowerCase().trim();
  const langMap: Record<string, string> = {
    'darija': 'darija', 'دارجة': 'darija', 'ar': 'darija', 'tunsi': 'darija',
    'french': 'french', 'français': 'french', 'fr': 'french', 'francais': 'french',
    'english': 'english', 'en': 'english', 'eng': 'english',
  };

  if (!lang || !langMap[lang]) {
    const current = loadLangPrefs()[chatId] ?? 'auto';
    await sendMessage(chatId,
      `🌍 *Language / اللغة / Langue*\n\n` +
      `Current: *${current}*\n\n` +
      `Switch:\n` +
      `/lang darija — 🇹🇳 دارجة تونسية\n` +
      `/lang french — 🇫🇷 Français\n` +
      `/lang english — 🇬🇧 English\n\n` +
      `_Achiri auto-detects your language, but you can set a preference here._`
    );
    return;
  }

  const resolved = langMap[lang];
  saveLangPref(chatId, resolved);

  // Inject preference into next chat by prepending a system hint
  handlers.delete(chatId); // reset handler to pick up new pref

  const responses: Record<string, string> = {
    darija: '✅ Tawa n7ki m3ak bel Darija! 🇹🇳',
    french: '✅ Je parlerai en français maintenant! 🇫🇷',
    english: '✅ I\'ll chat in English now! 🇬🇧',
  };
  await sendMessage(chatId, responses[resolved] ?? '✅ Language updated!');
}

// Sprint 355: /about — about Achiri
async function handleAbout(chatId: string): Promise<void> {
  await sendMessage(chatId,
    `🤖 *About Achiri*\n\n` +
    `Achiri is a culturally adaptive AI companion built specifically for Tunisia.\n\n` +
    `🇹🇳 Speaks Darija, French, and English\n` +
    `🧠 Remembers your conversations\n` +
    `🎭 Adapts to your mood and style\n` +
    `🔒 Private and safe\n\n` +
    `Built by Kognai — sovereign AI, made in Tunisia.\n\n` +
    `_Version: Alpha · Phase 2A_`
  );
}

// --- Sprint 357: /feedback — user bug reports and suggestions ---

const FEEDBACK_PATH = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'feedback.jsonl');

async function handleFeedback(chatId: string, args: string, firstName: string, username: string): Promise<void> {
  if (!args.trim()) {
    await sendMessage(chatId,
      `📝 *Send Feedback*\n\n` +
      `Tell us what you think! Usage:\n` +
      `/feedback Your message here\n\n` +
      `Example:\n` +
      `/feedback The language switch is great but Darija responses could be more natural`
    );
    return;
  }

  const entry = {
    chat_id: chatId,
    username: username || '',
    first_name: firstName || '',
    feedback: args.trim(),
    timestamp: new Date().toISOString(),
  };

  try {
    fs.appendFileSync(FEEDBACK_PATH, JSON.stringify(entry) + '\n');
    await sendMessage(chatId,
      `✅ *Merci bel feedback!*\n\n` +
      `Your feedback has been recorded. It helps us make Achiri better! 🙏\n` +
      `_Chokran 3al feedback — n7asnou Achiri bih!_`
    );
  } catch (err: any) {
    console.error(`[Achiri-TG] Feedback write error: ${err.message}`);
    await sendMessage(chatId, `⚠️ Could not save feedback. Please try again.`);
  }
}

// --- Sprint 357: /mood — mood check-in with personalized response ---

const MOOD_RESPONSES: Record<string, string> = {
  happy:   `😊 That's great to hear! Farhaan/e bik! Keep that energy going — tell me about your day!`,
  sad:     `💙 I'm here for you. Kol shi bahi, yji waqt w yetbaddel. Want to talk about what's on your mind?`,
  anxious: `🌿 Take a deep breath. Khodh nafs kbir... Sometimes just saying it out loud helps. What's worrying you?`,
  tired:   `😴 Rest is important, ya sahbi. Lazem terta7. Want a light chat to wind down, or should I leave you to rest?`,
  angry:   `🔥 I hear you. El ghadhab 3adi. Want to vent? I'm listening — no judgment.`,
  excited: `🎉 Yay! 7amasni! What's got you so excited? Tell me everything!`,
  bored:   `🎲 Mechi, let me fix that! Want a fun fact, a riddle, or should we talk about something interesting?`,
  neutral: `🤝 Alright, steady vibes. Ma3andek 7atta mochkla? Let's chat about whatever you want!`,
};

async function handleMood(chatId: string, args: string): Promise<void> {
  if (!args.trim()) {
    const moods = Object.keys(MOOD_RESPONSES);
    await sendMessage(chatId,
      `🎭 *How are you feeling?*\n\n` +
      `Tell me your mood:\n` +
      moods.map(m => `/mood ${m}`).join('\n') +
      `\n\nOr just type: /mood <anything you feel>`
    );
    return;
  }

  const mood = args.trim().toLowerCase();
  const response = MOOD_RESPONSES[mood];

  if (response) {
    // Log mood for analytics
    const moodLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'mood-log.jsonl');
    const entry = { chat_id: chatId, mood, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(moodLog, JSON.stringify(entry) + '\n'); } catch {}

    await sendMessage(chatId, `🎭 *Mood: ${mood}*\n\n${response}`);
  } else {
    // Free-form mood — route through Achiri for a personalized response
    const moodLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'mood-log.jsonl');
    const entry = { chat_id: chatId, mood, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(moodLog, JSON.stringify(entry) + '\n'); } catch {}

    try {
      tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
      const handler = getHandler(chatId);
      const reply = await handler.chat(`[User is checking in with mood: "${mood}". Respond warmly and empathetically in their preferred language. Acknowledge their feeling and engage naturally.]`);
      await sendMessage(chatId, `🎭 *Mood: ${mood}*\n\n${reply}`);
    } catch {
      await sendMessage(chatId, `🎭 *${mood}* — thanks for sharing! I'm here if you want to talk. 💬`);
    }
  }
}

// --- Sprint 358: /quiz — daily trivia for engagement ---

const QUIZ_QUESTIONS = [
  { q: 'What is the capital of Tunisia?', a: ['tunis', 'tunes'], answer: 'Tunis 🏛️' },
  { q: 'What is the traditional Tunisian pastry made with almonds and honey?', a: ['makroudh', 'makroud', 'مقروض'], answer: 'Makroudh 🍯' },
  { q: 'Which Tunisian city is known as the "Blue and White City"?', a: ['sidi bou said', 'sidi bou saïd', 'سيدي بوسعيد'], answer: 'Sidi Bou Said 💙🤍' },
  { q: 'What is the Tunisian national dish?', a: ['couscous', 'كسكسي', 'kosksi'], answer: 'Couscous 🍲' },
  { q: 'Which ancient civilization built Carthage?', a: ['phoenician', 'phoenicians', 'phéniciens', 'فينيقيين'], answer: 'The Phoenicians 🏛️' },
  { q: 'What is the largest desert in Tunisia?', a: ['sahara', 'صحراء'], answer: 'The Sahara 🏜️' },
  { q: 'What year did Tunisia gain independence?', a: ['1956'], answer: '1956 🇹🇳' },
  { q: 'What is "brik" in Tunisian cuisine?', a: ['pastry', 'egg pastry', 'fried pastry', 'بريك'], answer: 'A crispy fried pastry usually filled with egg, tuna, and capers 🥚' },
  { q: 'Which Tunisian island is the legendary land of the Lotus Eaters?', a: ['djerba', 'jerba', 'جربة'], answer: 'Djerba 🏝️' },
  { q: 'What does "yezzi" mean in Darija?', a: ['enough', 'stop', 'يزي', 'baraka'], answer: 'Enough / Stop! ✋' },
  { q: 'What is harissa?', a: ['chili paste', 'hot paste', 'pepper paste', 'هريسة'], answer: 'A spicy chili pepper paste — Tunisia\'s signature condiment 🌶️' },
  { q: 'Which Tunisian footballer played for Bayern Munich?', a: ['ali maaloul', 'maaloul'], answer: 'Trick question — no Tunisian played for Bayern! But Ali Maaloul is a legend 🔴' },
  { q: 'What is the old name of Tunisia?', a: ['ifriqiya', 'africa', 'إفريقية'], answer: 'Ifriqiya — the name "Africa" comes from it! 🌍' },
  { q: 'What is "7ouma" in Darija?', a: ['neighborhood', 'quartier', 'حومة'], answer: 'Neighborhood / quartier 🏘️' },
  { q: 'Which Tunisian city has the largest Roman amphitheatre in Africa?', a: ['el jem', 'el djem', 'الجم'], answer: 'El Jem — fits 35,000 spectators! 🏟️' },
];

const activeQuizzes = new Map<string, { questionIndex: number; asked: string }>();

async function handleQuiz(chatId: string, args: string): Promise<void> {
  // If user has an active quiz, check answer
  const active = activeQuizzes.get(chatId);
  if (active && args.trim()) {
    const q = QUIZ_QUESTIONS[active.questionIndex];
    const userAnswer = args.trim().toLowerCase();
    const correct = q.a.some(a => userAnswer.includes(a));
    activeQuizzes.delete(chatId);

    if (correct) {
      await sendMessage(chatId, `✅ *Correct!* ${q.answer}\n\nBravo! 🎉 Type /quiz for another question.`);
    } else {
      await sendMessage(chatId, `❌ *Not quite!* The answer is: ${q.answer}\n\nType /quiz to try another!`);
    }

    // Log quiz attempt
    const quizLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'quiz-log.jsonl');
    const entry = { chat_id: chatId, question: q.q, user_answer: args.trim(), correct, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(quizLog, JSON.stringify(entry) + '\n'); } catch {}
    return;
  }

  // Pick a random question
  const idx = Math.floor(Math.random() * QUIZ_QUESTIONS.length);
  const q = QUIZ_QUESTIONS[idx];
  activeQuizzes.set(chatId, { questionIndex: idx, asked: new Date().toISOString() });

  await sendMessage(chatId,
    `🎯 *Achiri Quiz Time!*\n\n` +
    `${q.q}\n\n` +
    `_Reply with: /quiz your answer_`
  );
}

// --- Sprint 360: /tip — Tunisian proverbs and daily wisdom ---

const TUNISIAN_PROVERBS = [
  { darija: 'اللي فات مات', french: 'Ce qui est passé est mort', english: 'What\'s past is dead — move forward', emoji: '🚀' },
  { darija: 'اللي يحب الورد يصبر على الشوك', french: 'Qui aime la rose supporte les épines', english: 'If you love roses, endure the thorns', emoji: '🌹' },
  { darija: 'الصبر مفتاح الفرج', french: 'La patience est la clé du soulagement', english: 'Patience is the key to relief', emoji: '🔑' },
  { darija: 'اللي ما عندوش الكبير يشريه', french: 'Qui n\'a pas de grand, qu\'il en achète un', english: 'If you don\'t have a mentor, find one', emoji: '🧠' },
  { darija: 'كل فول و أنت مسرور', french: 'Mange des fèves mais sois heureux', english: 'Eat simply but stay happy', emoji: '😊' },
  { darija: 'الدار دار بويا و الزنقة زنقة أميا', french: 'La maison est à mon père, la rue à ma mère', english: 'Home is where family is — treasure it', emoji: '🏠' },
  { darija: 'القرد في عين أمو غزال', french: 'Le singe est une gazelle aux yeux de sa mère', english: 'Every mother sees her child as beautiful', emoji: '🦌' },
  { darija: 'يد وحدة ما تصفق', french: 'Une seule main ne peut pas applaudir', english: 'One hand can\'t clap — teamwork matters', emoji: '👏' },
  { darija: 'اللي يزرع الريح يحصد العاصفة', french: 'Qui sème le vent récolte la tempête', english: 'Sow the wind, reap the storm', emoji: '🌪️' },
  { darija: 'الخبز خبزك و الزيت زيتك', french: 'Ton pain est ton pain, ton huile est ton huile', english: 'What\'s yours is yours — be self-reliant', emoji: '🫒' },
  { darija: 'العلم نور و الجهل ظلام', french: 'Le savoir est lumière, l\'ignorance est ténèbres', english: 'Knowledge is light, ignorance is darkness', emoji: '💡' },
  { darija: 'الحق يعلو و لا يُعلى عليه', french: 'La vérité s\'élève et ne peut être surpassée', english: 'Truth rises and nothing can overcome it', emoji: '⚖️' },
  { darija: 'اللي يضحك بالأول يبكي بالتالي', french: 'Qui rit en premier pleure après', english: 'Who laughs first, cries later — stay humble', emoji: '🙏' },
  { darija: 'كثر الدق يفك اللحام', french: 'Trop frapper finit par défaire la soudure', english: 'Persistence breaks through any barrier', emoji: '💪' },
  { darija: 'اللي ما يعرفك ما يثمنك', french: 'Qui ne te connaît pas ne te valorise pas', english: 'Those who don\'t know you can\'t appreciate you', emoji: '✨' },
  { darija: 'الجار قبل الدار', french: 'Le voisin avant la maison', english: 'Choose your neighbor before your house', emoji: '🤝' },
  { darija: 'اللي يعمل الخير ما يضيعش', french: 'Qui fait le bien ne perd jamais', english: 'Good deeds are never wasted', emoji: '🌟' },
  { darija: 'حتى لو قلتلك مش ممكن، جرب', french: 'Même si on te dit que c\'est impossible, essaie', english: 'Even if they say it\'s impossible, try', emoji: '🎯' },
];

async function handleTip(chatId: string): Promise<void> {
  // Pick based on day of year for consistency (same tip per day)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const idx = dayOfYear % TUNISIAN_PROVERBS.length;
  const p = TUNISIAN_PROVERBS[idx];

  await sendMessage(chatId,
    `${p.emoji} *Hikma tounsia* — Tunisian Wisdom\n\n` +
    `🇹🇳 *${p.darija}*\n` +
    `🇫🇷 _${p.french}_\n` +
    `🇬🇧 ${p.english}\n\n` +
    `_Type /tip anytime for today's wisdom_`
  );
}

// --- Sprint 361: /stats — user engagement stats ---

async function handleStats(chatId: string): Promise<void> {
  const DAILY_COUNTS_FILE = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'daily-counts.json');
  const memoryDir = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'memory');
  const historyFile = path.join(memoryDir, chatId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.jsonl');

  // Count messages from history file
  let totalMessages = 0;
  let firstSeen = '';
  let lastSeen = '';
  if (fs.existsSync(historyFile)) {
    const lines = fs.readFileSync(historyFile, 'utf-8').split('\n').filter(l => l.trim());
    totalMessages = lines.filter(l => {
      try { return JSON.parse(l).role === 'user'; } catch { return false; }
    }).length;

    // Find first and last timestamps
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          if (!firstSeen || entry.timestamp < firstSeen) firstSeen = entry.timestamp;
          if (!lastSeen || entry.timestamp > lastSeen) lastSeen = entry.timestamp;
        }
      } catch {}
    }
  }

  // Count active days from daily-counts
  let activeDays = 0;
  if (fs.existsSync(DAILY_COUNTS_FILE)) {
    try {
      const counts = JSON.parse(fs.readFileSync(DAILY_COUNTS_FILE, 'utf-8'));
      for (const day of Object.keys(counts)) {
        if (counts[day][chatId] && counts[day][chatId] > 0) activeDays++;
      }
    } catch {}
  }

  // Mood count
  const moodLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'mood-log.jsonl');
  let moodCheckins = 0;
  if (fs.existsSync(moodLog)) {
    moodCheckins = fs.readFileSync(moodLog, 'utf-8').split('\n')
      .filter(l => { try { return JSON.parse(l).chat_id === chatId; } catch { return false; } }).length;
  }

  // Quiz attempts
  const quizLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'quiz-log.jsonl');
  let quizAttempts = 0;
  let quizCorrect = 0;
  if (fs.existsSync(quizLog)) {
    for (const line of fs.readFileSync(quizLog, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.chat_id === chatId) {
          quizAttempts++;
          if (e.correct) quizCorrect++;
        }
      } catch {}
    }
  }

  // Sprint 391: Conversation streak tracker
  let currentStreak = 0;
  let bestStreak = 0;
  const activeDaysSorted: string[] = [];
  if (fs.existsSync(DAILY_COUNTS_FILE)) {
    try {
      const counts = JSON.parse(fs.readFileSync(DAILY_COUNTS_FILE, 'utf-8'));
      for (const day of Object.keys(counts)) {
        if (counts[day][chatId] && counts[day][chatId] > 0) activeDaysSorted.push(day);
      }
      activeDaysSorted.sort();
    } catch {}
  }

  if (activeDaysSorted.length > 0) {
    // Calculate current streak (counting back from today/yesterday)
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const hasToday = activeDaysSorted.includes(today);
    const hasYesterday = activeDaysSorted.includes(yesterday);

    if (hasToday || hasYesterday) {
      let checkDate = new Date(hasToday ? today : yesterday);
      while (true) {
        const ds = checkDate.toISOString().slice(0, 10);
        if (activeDaysSorted.includes(ds)) {
          currentStreak++;
          checkDate = new Date(checkDate.getTime() - 86400000);
        } else break;
      }
    }

    // Calculate best streak
    let streak = 1;
    for (let i = 1; i < activeDaysSorted.length; i++) {
      const prev = new Date(activeDaysSorted[i - 1]).getTime();
      const curr = new Date(activeDaysSorted[i]).getTime();
      if (curr - prev === 86400000) streak++;
      else { bestStreak = Math.max(bestStreak, streak); streak = 1; }
    }
    bestStreak = Math.max(bestStreak, streak);
  }

  const streakEmoji = currentStreak >= 7 ? '🔥🔥🔥' : currentStreak >= 3 ? '🔥🔥' : currentStreak >= 1 ? '🔥' : '❄️';
  const milestoneMsg = currentStreak === 3 ? '\n🎉 _3-day streak! Keep it up!_' :
                       currentStreak === 7 ? '\n🏆 _1 week streak! You\'re on fire!_' :
                       currentStreak === 14 ? '\n👑 _2 week streak! Legend!_' :
                       currentStreak === 30 ? '\n💎 _30-day streak! Tunisian champion!_' : '';

  const firstSeenStr = firstSeen ? firstSeen.slice(0, 10) : 'N/A';
  const out: string[] = [
    `📊 *Your Achiri Stats*`,
    '',
    `${streakEmoji} Streak: *${currentStreak} day${currentStreak !== 1 ? 's' : ''}* (best: ${bestStreak})${milestoneMsg}`,
    `💬 Messages: ${totalMessages}`,
    `📅 Active days: ${activeDays}`,
    `🗓️ First seen: ${firstSeenStr}`,
  ];

  if (moodCheckins > 0) out.push(`🎭 Mood check-ins: ${moodCheckins}`);
  if (quizAttempts > 0) out.push(`🎯 Quiz: ${quizCorrect}/${quizAttempts} correct`);

  // Learning stats (Sprint 391)
  const learnLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'learn-log.jsonl');
  let learnAttempts = 0;
  let learnCorrect = 0;
  if (fs.existsSync(learnLog)) {
    for (const line of fs.readFileSync(learnLog, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.chat_id === chatId) { learnAttempts++; if (e.correct) learnCorrect++; }
      } catch {}
    }
  }
  if (learnAttempts > 0) out.push(`📚 Darija lessons: ${learnCorrect}/${learnAttempts} correct`);

  // Sprint 403: Referral count
  const refCount = getReferralCount(chatId);
  if (refCount > 0) out.push(`🤝 Referrals: ${refCount} friend${refCount !== 1 ? 's' : ''} invited`);

  out.push('', currentStreak === 0 ? '_Chat daily to build your streak!_ 🔥' : '_Keep chatting — every conversation makes Achiri smarter!_ 🧠');

  await sendMessage(chatId, out.join('\n'));
}

// --- Sprint 403: /invite — referral sharing ---

async function handleInvite(chatId: string, firstName: string): Promise<void> {
  // Get bot username from the bot API (cached)
  let botUsername = 'AchiriBot'; // fallback
  try {
    const me = await tgApi('getMe');
    if (me?.username) botUsername = me.username;
  } catch { /* use fallback */ }

  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const refCount = getReferralCount(chatId);

  await sendMessage(chatId, [
    '🤝 *Invite Your Friends to Achiri!*',
    '',
    '📲 Share this link:',
    `\`${refLink}\``,
    '',
    '💬 Or copy-paste this message:',
    '',
    `_"${firstName} invites you to Achiri 🇹🇳 — your AI companion made for Tunisia! Chat in Darija, French, or English. Try it:_ ${refLink}_"_`,
    '',
    `📊 Your referrals: *${refCount}* friend${refCount !== 1 ? 's' : ''}`,
    refCount >= 5 ? '🏆 _Champion referrer! Barcha ya3ichek!_' :
    refCount >= 1 ? '🔥 _Keep sharing — every friend counts!_' :
    '💡 _Share with sa7bek/sa7abtek and grow the Achiri community!_',
  ].join('\n'));
}

// --- Sprint 388: /learn — Darija word of the day + mini lesson ---

const DARIJA_LESSONS = [
  { word: 'يزي', latin: 'yezzi', meaning: 'Enough / Stop', example: 'Yezzi, ma t3awdch! (Enough, don\'t repeat it!)', category: 'daily' },
  { word: 'برشا', latin: 'barcha', meaning: 'A lot / Very much', example: 'N7ebek barcha! (I love you a lot!)', category: 'daily' },
  { word: 'شنوة', latin: 'chnowa', meaning: 'What?', example: 'Chnowa t7eb? (What do you want?)', category: 'question' },
  { word: 'كيفاش', latin: 'kifech', meaning: 'How?', example: 'Kifech 7alek? (How are you?)', category: 'question' },
  { word: 'وين', latin: 'win', meaning: 'Where?', example: 'Win mchi? (Where are you going?)', category: 'question' },
  { word: 'فيسع', latin: 'fisa3', meaning: 'Quickly / Right away', example: 'Arwah fisa3! (Come quickly!)', category: 'daily' },
  { word: 'صحبي', latin: 'sa7bi', meaning: 'My friend (male)', example: 'Ahla sa7bi! (Hey, my friend!)', category: 'social' },
  { word: 'ما ثمّاش', latin: 'ma thammech', meaning: 'There isn\'t / Nothing', example: 'Ma thammech mochkla. (There\'s no problem.)', category: 'daily' },
  { word: 'خطرة', latin: 'khatra', meaning: 'Sometimes', example: 'Khatra nemchi lel b7ar. (Sometimes I go to the sea.)', category: 'time' },
  { word: 'نحب', latin: 'n7eb', meaning: 'I want / I love', example: 'N7eb 9ahwa. (I want coffee.)', category: 'daily' },
  { word: 'إي', latin: 'ey/ih', meaning: 'Yes', example: 'Ih, mech mochkla! (Yes, no problem!)', category: 'basic' },
  { word: 'لا', latin: 'le', meaning: 'No', example: 'Le, ma n7ebch. (No, I don\'t want.)', category: 'basic' },
  { word: 'بالاهي', latin: 'bellahi', meaning: 'Please / I beg you', example: 'Bellahi 3awenni. (Please help me.)', category: 'social' },
  { word: 'يعيشك', latin: 'ya3ichek', meaning: 'Thank you (lit: may you live)', example: 'Ya3ichek, barcha na7ki! (Thank you, much appreciated!)', category: 'social' },
  { word: 'هكّة', latin: 'hakka', meaning: 'Like this / This way', example: 'A3mlha hakka! (Do it like this!)', category: 'daily' },
  { word: 'ماهو', latin: 'mehou', meaning: 'Because / Well...', example: 'Mehou, chnowa na3ml? (Well, what should I do?)', category: 'connectors' },
  { word: 'شوية', latin: 'chwaya', meaning: 'A little / A bit', example: 'Stanna chwaya. (Wait a little.)', category: 'daily' },
  { word: 'توّا', latin: 'tawa', meaning: 'Now', example: 'Tawa nemchi. (I\'m going now.)', category: 'time' },
  { word: 'غدوة', latin: 'ghodwa', meaning: 'Tomorrow', example: 'Nchoufek ghodwa! (See you tomorrow!)', category: 'time' },
  { word: 'البارح', latin: 'lbar7', meaning: 'Yesterday', example: 'Lbar7 kont fi Tunis. (Yesterday I was in Tunis.)', category: 'time' },
  { word: 'قهوة', latin: '9ahwa', meaning: 'Coffee / Café', example: 'Nemchiw lel 9ahwa? (Shall we go to the café?)', category: 'food' },
  { word: 'ماكلة', latin: 'makla', meaning: 'Food', example: 'El makla bnina! (The food is delicious!)', category: 'food' },
  { word: 'بنين', latin: 'bnin', meaning: 'Delicious', example: 'El kosksi bnin barcha! (The couscous is very delicious!)', category: 'food' },
  { word: 'حومة', latin: '7ouma', meaning: 'Neighborhood', example: 'El 7ouma mte3i hkeya. (My neighborhood is amazing.)', category: 'places' },
  { word: 'خدمة', latin: 'khedma', meaning: 'Work / Job', example: 'El khedma s3iba lyoum. (Work is hard today.)', category: 'daily' },
];

const activeLessons = new Map<string, { wordIndex: number }>();

async function handleLearn(chatId: string, args: string): Promise<void> {
  // Check if user is answering a quiz from /learn
  const active = activeLessons.get(chatId);
  if (active && args.trim()) {
    const lesson = DARIJA_LESSONS[active.wordIndex];
    const answer = args.trim().toLowerCase();
    const correct = answer.includes(lesson.meaning.toLowerCase().split('/')[0].trim()) ||
                    answer.includes(lesson.latin.toLowerCase());
    activeLessons.delete(chatId);

    if (correct) {
      await sendMessage(chatId,
        `✅ *Ahsant!* (Well done!)\n\n` +
        `*${lesson.latin}* (${lesson.word}) = ${lesson.meaning}\n\n` +
        `Type /learn for the next word! 📚`
      );
    } else {
      await sendMessage(chatId,
        `❌ Not quite! The answer is:\n\n` +
        `*${lesson.latin}* (${lesson.word}) = ${lesson.meaning}\n` +
        `📝 ${lesson.example}\n\n` +
        `Type /learn to try another word! 📚`
      );
    }

    // Log learning attempt
    const learnLog = path.join(__dirname, '..', '..', 'workspace', 'achiri', 'learn-log.jsonl');
    const entry = { chat_id: chatId, word: lesson.latin, correct, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(learnLog, JSON.stringify(entry) + '\n'); } catch {}
    return;
  }

  // Category filter
  const categoryFilter = args.trim().toLowerCase();
  const validCategories = Array.from(new Set(DARIJA_LESSONS.map(l => l.category)));
  let pool = DARIJA_LESSONS;
  if (categoryFilter && validCategories.includes(categoryFilter)) {
    pool = DARIJA_LESSONS.filter(l => l.category === categoryFilter);
  }

  // Pick a word — rotate based on day + user chatId hash
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const userHash = chatId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const idx = (dayOfYear + userHash) % pool.length;
  const globalIdx = DARIJA_LESSONS.indexOf(pool[idx]);
  const lesson = pool[idx];

  activeLessons.set(chatId, { wordIndex: globalIdx });

  const categoryEmoji: Record<string, string> = {
    daily: '🗣️', question: '❓', social: '🤝', time: '⏰',
    basic: '🔤', food: '🍽️', places: '📍', connectors: '🔗',
  };
  const emoji = categoryEmoji[lesson.category] ?? '📚';

  await sendMessage(chatId,
    `📚 *Ta3allam Darija!* — Learn Tunisian\n\n` +
    `${emoji} Category: *${lesson.category}*\n\n` +
    `🇹🇳 *${lesson.word}*\n` +
    `🔤 Pronounced: *${lesson.latin}*\n` +
    `📝 ${lesson.example}\n\n` +
    `❓ *What does "${lesson.latin}" mean?*\n` +
    `_Reply with: /learn your answer_\n\n` +
    `_Categories: ${validCategories.join(', ')}_\n` +
    `_Try: /learn food_`
  );
}

// --- Sprint 412: /memory — transparency into what Achiri remembers ---

async function handleMemory(chatId: string, args: string): Promise<void> {
  const subCmd = args.toLowerCase().trim();

  // /memory clear — wipe all data
  if (subCmd === 'clear') {
    const store = new AchiriMemoryStore();
    store.clearHistory(chatId);
    handlers.delete(chatId);
    await sendMessage(chatId,
      `🗑️ *Memory cleared!*\n\n` +
      `All your conversation history, profile data, and summaries have been deleted.\n` +
      `Fresh start — bnédi min jdid! 🌱`
    );
    return;
  }

  // /memory — show what we know
  const profile = extractUserProfile(chatId);
  const summary = loadSummary(chatId);

  const langMap: Record<string, string> = {
    darija: '🇹🇳 Darija',
    french: '🇫🇷 French',
    english: '🇬🇧 English',
    mixed: '🌍 Mixed',
  };

  const lines: string[] = [
    `🧠 *What Achiri Remembers About You*`,
    '',
  ];

  if (profile.message_count === 0) {
    lines.push(`_No conversations yet — say something and I'll start remembering!_`);
  } else {
    lines.push(`*Profile:*`);
    lines.push(`• Language: ${langMap[profile.preferred_language] ?? profile.preferred_language}`);
    if (profile.dialect !== 'unknown') {
      lines.push(`• Dialect: ${profile.dialect} (confidence: ${Math.round(profile.dialect_confidence * 100)}%)`);
    }
    lines.push(`• Formality: ${profile.formality}`);
    lines.push(`• Messages: ${profile.message_count}`);
    lines.push(`• Avg length: ${profile.avg_message_length} chars`);
    if (profile.first_seen) lines.push(`• First seen: ${profile.first_seen.split('T')[0]}`);
    if (profile.last_seen) lines.push(`• Last seen: ${profile.last_seen.split('T')[0]}`);
    lines.push('');

    if (profile.top_interests.length > 0) {
      lines.push(`*Your Interests:*`);
      for (const interest of profile.top_interests) {
        lines.push(`• ${interest}`);
      }
      lines.push('');
    }

    if (summary) {
      lines.push(`*Conversation Summary:*`);
      const summaryText = typeof summary === 'string' ? summary : (summary as any).summary ?? JSON.stringify(summary);
      lines.push(summaryText.slice(0, 500));
      if (summaryText.length > 500) lines.push('_...(truncated)_');
      lines.push('');
    }
  }

  lines.push(`_To clear all data: /memory clear_`);
  lines.push(`_Your data stays on our server only. Never shared._`);

  await sendMessage(chatId, lines.join('\n'));
}

// --- Sprint 390: /translate — Darija/French/English quick translator ---

const TRANSLATION_DICT: Array<{ darija: string; latin: string; french: string; english: string }> = [
  { darija: 'مرحبا', latin: 'marhba', french: 'bienvenue', english: 'welcome' },
  { darija: 'لاباس', latin: 'labas', french: 'ça va', english: 'how are you / fine' },
  { darija: 'شكرا', latin: 'choukran', french: 'merci', english: 'thank you' },
  { darija: 'يعيشك', latin: 'ya3ichek', french: 'merci beaucoup', english: 'thank you (may you live)' },
  { darija: 'نعم', latin: 'na3am', french: 'oui', english: 'yes' },
  { darija: 'إي', latin: 'ih/ey', french: 'oui', english: 'yes (informal)' },
  { darija: 'لا', latin: 'le', french: 'non', english: 'no' },
  { darija: 'بالاهي', latin: 'bellahi', french: 's\'il te plaît', english: 'please' },
  { darija: 'سماحني', latin: 'sme7ni', french: 'excuse-moi', english: 'excuse me / sorry' },
  { darija: 'ماء', latin: 'me', french: 'eau', english: 'water' },
  { darija: 'خبز', latin: 'khobz', french: 'pain', english: 'bread' },
  { darija: 'قهوة', latin: '9ahwa', french: 'café', english: 'coffee' },
  { darija: 'حليب', latin: '7lib', french: 'lait', english: 'milk' },
  { darija: 'ماكلة', latin: 'makla', french: 'nourriture', english: 'food' },
  { darija: 'بنين', latin: 'bnin', french: 'délicieux', english: 'delicious' },
  { darija: 'دار', latin: 'dar', french: 'maison', english: 'house / home' },
  { darija: 'خدمة', latin: 'khedma', french: 'travail', english: 'work' },
  { darija: 'فلوس', latin: 'flous', french: 'argent', english: 'money' },
  { darija: 'صحبي', latin: 'sa7bi', french: 'mon ami', english: 'my friend (male)' },
  { darija: 'صحبتي', latin: 'sa7bti', french: 'mon amie', english: 'my friend (female)' },
  { darija: 'عائلة', latin: '3ayla', french: 'famille', english: 'family' },
  { darija: 'حب', latin: '7ob', french: 'amour', english: 'love' },
  { darija: 'نحبك', latin: 'n7ebek', french: 'je t\'aime', english: 'I love you' },
  { darija: 'برشا', latin: 'barcha', french: 'beaucoup', english: 'a lot / very much' },
  { darija: 'شوية', latin: 'chwaya', french: 'un peu', english: 'a little' },
  { darija: 'توا', latin: 'tawa', french: 'maintenant', english: 'now' },
  { darija: 'غدوة', latin: 'ghodwa', french: 'demain', english: 'tomorrow' },
  { darija: 'البارح', latin: 'lbar7', french: 'hier', english: 'yesterday' },
  { darija: 'كبير', latin: 'kbir', french: 'grand', english: 'big / old' },
  { darija: 'صغير', latin: 'sghir', french: 'petit', english: 'small / young' },
  { darija: 'مليح', latin: 'mli7', french: 'bon / bien', english: 'good / well' },
  { darija: 'خايب', latin: 'kheyeb', french: 'mauvais', english: 'bad' },
  { darija: 'فيسع', latin: 'fisa3', french: 'vite', english: 'quickly' },
  { darija: 'حومة', latin: '7ouma', french: 'quartier', english: 'neighborhood' },
  { darija: 'سوق', latin: 'sou9', french: 'marché', english: 'market' },
  { darija: 'بحر', latin: 'b7ar', french: 'mer', english: 'sea' },
  { darija: 'شمس', latin: 'chams', french: 'soleil', english: 'sun' },
  { darija: 'مطر', latin: 'mtar', french: 'pluie', english: 'rain' },
  { darija: 'بنت', latin: 'bent', french: 'fille', english: 'girl / daughter' },
  { darija: 'ولد', latin: 'weld', french: 'garçon / fils', english: 'boy / son' },
];

function handleTranslate(args: string): string {
  const query = args.trim().toLowerCase();
  if (!query) {
    return (
      `🌍 *Achiri Translator*\n\n` +
      `Usage: \`/translate <word>\`\n\n` +
      `Examples:\n` +
      `• \`/translate hello\`\n` +
      `• \`/translate merci\`\n` +
      `• \`/translate barcha\`\n` +
      `• \`/translate مرحبا\`\n\n` +
      `Supports Darija ↔ French ↔ English\n` +
      `_${TRANSLATION_DICT.length} words in dictionary_`
    );
  }

  // Search across all fields
  const results = TRANSLATION_DICT.filter(entry =>
    entry.darija.includes(query) ||
    entry.latin.toLowerCase().includes(query) ||
    entry.french.toLowerCase().includes(query) ||
    entry.english.toLowerCase().includes(query)
  );

  if (results.length === 0) {
    // Find closest match by prefix
    const partial = TRANSLATION_DICT.filter(entry =>
      entry.latin.toLowerCase().startsWith(query.slice(0, 3)) ||
      entry.french.toLowerCase().startsWith(query.slice(0, 3)) ||
      entry.english.toLowerCase().startsWith(query.slice(0, 3))
    ).slice(0, 3);

    if (partial.length > 0) {
      const suggestions = partial.map(p => `  • ${p.latin} — ${p.english}`).join('\n');
      return `❓ No exact match for "${query}"\n\n*Did you mean:*\n${suggestions}\n\n_Try: /translate ${partial[0].latin}_`;
    }
    return `❓ No translation found for "${query}"\n\n_Try common words like: hello, merci, barcha, choukran_`;
  }

  const lines: string[] = [`🌍 *Translation: "${query}"*`, ''];
  for (const r of results.slice(0, 5)) {
    lines.push(`🇹🇳 *${r.darija}* (${r.latin})`);
    lines.push(`🇫🇷 ${r.french}`);
    lines.push(`🇬🇧 ${r.english}`);
    lines.push('');
  }

  if (results.length > 5) {
    lines.push(`_...and ${results.length - 5} more matches_`);
  }

  return lines.join('\n');
}

// Sprint 621: /upgrade — tier comparison + PayMee checkout
async function handleUpgrade(chatId: string, args: string, firstName: string): Promise<void> {
  const tier = args.toLowerCase().trim();

  // No args: show tier comparison
  if (!tier || (tier !== 'basic' && tier !== 'premium')) {
    await sendMessage(chatId,
      `✨ *Achiri Tiers*\n\n` +
      `🆓 *Free* (current)\n` +
      `• 50 messages/day\n` +
      `• Basic conversation history (50 turns)\n` +
      `• Cultural context\n\n` +
      `💎 *Basic* — 9 TND/month\n` +
      `• Unlimited messages\n` +
      `• Extended memory (200 turns)\n` +
      `• Semantic memory search\n` +
      `• Claude Haiku model\n\n` +
      `👑 *Premium* — 25 TND/month\n` +
      `• Unlimited messages\n` +
      `• Extended memory (500 turns)\n` +
      `• Semantic memory search\n` +
      `• Voice messages\n` +
      `• Claude Sonnet model\n\n` +
      `_To upgrade:_\n` +
      `/upgrade basic — 9 TND/month\n` +
      `/upgrade premium — 25 TND/month`
    );
    return;
  }

  const paymTier = tier === 'basic' ? 'tnd_basic' as const : 'tnd_premium' as const;

  try {
    const result = await createCheckoutUrl({
      userId: chatId,
      tier: paymTier,
      firstName: firstName || undefined,
    });
    const mockNote = result.mock ? '\n\n⚠️ _Test mode — payment not charged_' : '';
    await sendMessage(chatId,
      `💳 *Upgrade to ${tier === 'basic' ? 'Basic' : 'Premium'}*\n\n` +
      `Amount: *${result.amount_tnd} TND/month*\n` +
      `Order: \`${result.order_id}\`\n\n` +
      `[Pay with PayMee →](${result.checkout_url})${mockNote}`
    );
  } catch (err) {
    console.error('[Achiri-TG] upgrade error:', err);
    await sendMessage(chatId, '❌ Payment link generation failed. Please try again later.');
  }
}

// --- Main message handler ---

async function handleMessage(chatId: string, text: string, firstName: string, username: string): Promise<void> {
  // Commands
  const cmd = text.split(' ')[0].toLowerCase().split('@')[0];
  const args = text.includes(' ') ? text.slice(text.indexOf(' ') + 1).trim() : '';

  if (cmd === '/start') return handleStart(chatId, firstName, username, args);
  if (cmd === '/help') return handleHelp(chatId);
  if (cmd === '/clear') return handleClear(chatId);
  if (cmd === '/lang') return handleLang(chatId, args);
  if (cmd === '/about') return handleAbout(chatId);
  if (cmd === '/feedback') return handleFeedback(chatId, args, firstName, username);
  if (cmd === '/mood') return handleMood(chatId, args);
  if (cmd === '/quiz') return handleQuiz(chatId, args);
  if (cmd === '/tip') return handleTip(chatId);
  if (cmd === '/stats') return handleStats(chatId);
  if (cmd === '/invite') return handleInvite(chatId, firstName);
  if (cmd === '/learn') return handleLearn(chatId, args);
  if (cmd === '/translate') return sendMessage(chatId, handleTranslate(args));
  if (cmd === '/memory') return handleMemory(chatId, args);
  if (cmd === '/upgrade') return handleUpgrade(chatId, args, firstName);

  // Access check
  if (!hasAccess(chatId)) {
    if (!isOnWaitlist(chatId)) addToWaitlist(chatId, firstName, username);
    await sendMessage(chatId,
      `🔒 Achiri is currently in *alpha* — access is limited.\n` +
      `You've been added to the waitlist! We'll notify you when you're in.\n\n` +
      `_Achiri fi alpha tawa. Dkhalt fil waitlist!_`
    );
    return;
  }

  // Chat with Achiri
  try {
    // Show "typing" indicator
    tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

    const handler = getHandler(chatId);
    // Inject language preference as prefix hint
    const langPref = loadLangPrefs()[chatId];
    const langHints: Record<string, string> = {
      darija: '[User prefers Darija (Tunisian Arabic). Respond primarily in Darija.] ',
      french: '[User prefers French. Respond primarily in French.] ',
      english: '[User prefers English. Respond primarily in English.] ',
    };
    const effectiveMsg = langPref && langHints[langPref] ? langHints[langPref] + text : text;
    const reply = await handler.chat(effectiveMsg);

    // Check for limit exceeded
    if (reply.startsWith(ACHIRI_LIMIT_EXCEEDED)) {
      const msg = reply.slice(ACHIRI_LIMIT_EXCEEDED.length).trim();
      await sendMessage(chatId, `⏳ ${msg}`);
      return;
    }

    await sendMessage(chatId, reply);
  } catch (err: any) {
    console.error(`[Achiri-TG] Error for ${chatId}: ${err.message}`);
    await sendMessage(chatId,
      `⚠️ Mawjoud un problème technique. 3awed b3d chwaya!\n` +
      `_(Technical issue — try again in a moment)_`
    );
  }
}

// --- Polling loop ---

async function poll(): Promise<void> {
  let offset = loadOffset();
  let backoffMs = 1000;

  console.log(`[Achiri-TG] Starting — polling (offset: ${offset})`);
  if (ALLOWED_IDS.length > 0) {
    console.log(`[Achiri-TG] Whitelist mode: ${ALLOWED_IDS.length} allowed IDs`);
  } else {
    console.log(`[Achiri-TG] Open alpha mode — all users allowed`);
  }

  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const text = msg.text.trim();
        const firstName = msg.from?.first_name ?? 'friend';
        const username = msg.from?.username ?? '';

        await handleMessage(chatId, text, firstName, username).catch((e: Error) => {
          console.error(`[Achiri-TG] Handler error: ${e.message}`);
        });
      }

      if (updates.length > 0) saveOffset(offset);
      backoffMs = 1000;
    } catch (e: any) {
      console.error(`[Achiri-TG] Poll error: ${e.message}`);
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60000);
    }
  }
}

poll().catch(err => {
  console.error('[Achiri-TG] Fatal:', err);
  process.exit(1);
});
