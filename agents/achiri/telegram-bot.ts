// Achiri Telegram Bot — Sprint 352
// User-facing chat interface for Achiri alpha launch.
// Bridges Telegram messages → AchiriConversationHandler.chat() → Telegram reply.
// Separate from operator bot (scripts/telegram-bot.ts).
// Env: ACHIRI_TELEGRAM_BOT_TOKEN (required), ACHIRI_ALLOWED_CHAT_IDS (optional CSV whitelist)

import * as fs from 'fs';
import * as path from 'path';
import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from './index';
import { AchiriMemoryStore } from './memory-store';

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

async function handleStart(chatId: string, firstName: string, username: string): Promise<void> {
  if (!isOnWaitlist(chatId)) {
    addToWaitlist(chatId, firstName, username);
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

  const firstSeenStr = firstSeen ? firstSeen.slice(0, 10) : 'N/A';
  const out: string[] = [
    `📊 *Your Achiri Stats*`,
    '',
    `💬 Messages: ${totalMessages}`,
    `📅 Active days: ${activeDays}`,
    `🗓️ First seen: ${firstSeenStr}`,
  ];

  if (moodCheckins > 0) out.push(`🎭 Mood check-ins: ${moodCheckins}`);
  if (quizAttempts > 0) out.push(`🎯 Quiz: ${quizCorrect}/${quizAttempts} correct`);

  out.push('', '_Keep chatting — every conversation makes Achiri smarter!_ 🧠');

  await sendMessage(chatId, out.join('\n'));
}

// --- Main message handler ---

async function handleMessage(chatId: string, text: string, firstName: string, username: string): Promise<void> {
  // Commands
  const cmd = text.split(' ')[0].toLowerCase().split('@')[0];
  const args = text.includes(' ') ? text.slice(text.indexOf(' ') + 1).trim() : '';

  if (cmd === '/start') return handleStart(chatId, firstName, username);
  if (cmd === '/help') return handleHelp(chatId);
  if (cmd === '/clear') return handleClear(chatId);
  if (cmd === '/lang') return handleLang(chatId, args);
  if (cmd === '/about') return handleAbout(chatId);
  if (cmd === '/feedback') return handleFeedback(chatId, args, firstName, username);
  if (cmd === '/mood') return handleMood(chatId, args);
  if (cmd === '/quiz') return handleQuiz(chatId, args);
  if (cmd === '/tip') return handleTip(chatId);
  if (cmd === '/stats') return handleStats(chatId);

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
