/**
 * Telegram bot commands — interactive posting session flow.
 * Extracted from telegram-bot.ts (Sprint 496).
 */

import * as fs from 'fs';
import * as path from 'path';
import { sendMessage, sendMessageWithButtons, sendVideoWithButtons } from './telegram-api';
import { ROOT, readLines, readRealPosts, findCaptionedMp4, getExperimentData, buildTikTokCaption } from './shared';

// ─── Posting session state ────────────────────────────────────────
interface PostingSession {
  active: boolean;
  chatId: string;
  startedAt: string;
  videosPosted: string[];
  currentVideoId: string | null;
}

let postingSession: PostingSession = { active: false, chatId: '', startedAt: '', videosPosted: [], currentVideoId: null };

function getNextUnpostedVideo(): { video_id: string; mp4Path: string; caption: string; viralScore: number | null; speaker: string } | null {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  // Sprint 1228: use readRealPosts so dry-run posts don't hide videos from session queue
  const recorded = readRealPosts();
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  for (const id of postingSession.videosPosted) recordedIds.add(id);

  const viralScores = new Map<string, number>();
  const speakers = new Map<string, string>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        if (id && e.speaker) speakers.set(id, e.speaker);
      } catch { /* skip */ }
    }
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? -1) - (viralScores.get(a.video_id) ?? -1));

  for (const entry of unposted) {
    const mp4Path = findCaptionedMp4(entry.video_id);
    if (mp4Path) {
      return {
        video_id: entry.video_id,
        mp4Path,
        caption: buildTikTokCaption(entry.video_id),
        viralScore: viralScores.get(entry.video_id) ?? null,
        speaker: speakers.get(entry.video_id) ?? 'unknown',
      };
    }
  }
  return null;
}

async function sendNextSessionVideo(chatId: string): Promise<void> {
  const next = getNextUnpostedVideo();
  if (!next) {
    await sendMessage(chatId, '📦 No more ready videos! Run `/refresh` to generate more.');
    await cmdEndSession(chatId);
    return;
  }

  postingSession.currentVideoId = next.video_id;
  const vsStr = next.viralScore != null ? ` 🧬${next.viralScore}` : '';
  const spkStr = next.speaker !== 'unknown' ? ` 🎙️${next.speaker}` : '';
  const num = postingSession.videosPosted.length + 1;

  const tgCaption = [
    `📦 *#${num}*${vsStr}${spkStr}`,
    '',
    next.caption,
    '',
    '_Save → post on TikTok → tap ✅ Done below_',
  ].join('\n');

  const sessionButtons = [
    [
      { text: '✅ Done — Posted', callback_data: 'cmd:/done' },
      { text: '⏭ Skip', callback_data: 'cmd:/done' },
    ],
    [
      { text: '🛑 End Session', callback_data: 'cmd:/endsession' },
    ],
  ];
  try {
    await sendVideoWithButtons(chatId, next.mp4Path, tgCaption, sessionButtons);
  } catch (err: any) {
    await sendMessage(chatId, `⚠️ Failed to send video \`${next.video_id}\`: ${err.message?.slice(0, 100)}\nSkipping — type \`/done\` to get next.`);
  }
}

export async function cmdSession(chatId: string): Promise<void> {
  if (postingSession.active) {
    await sendMessage(chatId, `⚠️ Session already active (${postingSession.videosPosted.length} posted). Type \`/done\` after posting or \`/endsession\` to finish.`);
    return;
  }

  // Sprint 1228: use readRealPosts to exclude dry-run entries from gate count
  const manualPosts = readRealPosts();
  const postsNeeded = Math.max(0, 30 - manualPosts.length);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const dailyTarget = Math.min(5, Math.ceil(postsNeeded / daysLeft));

  if (postsNeeded === 0) {
    await sendMessage(chatId, '✅ Gate target met! No posting session needed.');
    return;
  }

  postingSession = {
    active: true,
    chatId,
    startedAt: new Date().toISOString(),
    videosPosted: [],
    currentVideoId: null,
  };

  await sendMessage(chatId, [
    '🎬 *Posting Session Started!*',
    '',
    `📊 Gate: ${manualPosts.length}/30 posts · ${postsNeeded} to go · ${daysLeft}d left`,
    `🎯 Today's target: *${dailyTarget} videos*`,
    '',
    'Workflow: I send a video → you post on TikTok → type `/done`',
    'Type `/endsession` when finished.',
    '',
    'Sending first video...',
  ].join('\n'));

  await sendNextSessionVideo(chatId);
}

export async function cmdDone(chatId: string): Promise<void> {
  if (!postingSession.active) {
    await sendMessage(chatId, '⚠️ No active session. Type `/session` to start one.');
    return;
  }

  if (!postingSession.currentVideoId) {
    await sendMessage(chatId, '⚠️ No video pending. Sending next...');
    await sendNextSessionVideo(chatId);
    return;
  }

  const videoId = postingSession.currentVideoId;
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const expData = getExperimentData(videoId);
  const entry = {
    video_id: videoId,
    views: 0,
    speaker: expData.speaker !== 'unknown' ? expData.speaker : undefined,
    hook_formula: expData.hook_formula !== 'unknown' ? expData.hook_formula : undefined,
    viral_score: expData.viral_score,
    topic: expData.topic,
    posted_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    source: 'session',
  };
  const dir = path.dirname(manualPostsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(manualPostsPath, JSON.stringify(entry) + '\n', 'utf-8');

  postingSession.videosPosted.push(videoId);
  postingSession.currentVideoId = null;

  const allPosts = readLines(manualPostsPath);
  const postCount = allPosts.length;
  const postsLeft = Math.max(0, 30 - postCount);

  await sendMessage(chatId, [
    `✅ *Posted!* \`${videoId}\``,
    `📊 Session: ${postingSession.videosPosted.length} done · Gate: ${postCount}/30${postsLeft > 0 ? ` · ${postsLeft} to go` : ' 🎉'}`,
    '',
    postsLeft > 0 ? 'Sending next video...' : '🎉 Gate target met!',
  ].join('\n'));

  if (postsLeft > 0) {
    await sendNextSessionVideo(chatId);
  } else {
    await cmdEndSession(chatId);
  }
}

export async function cmdEndSession(chatId: string): Promise<void> {
  if (!postingSession.active) {
    await sendMessage(chatId, '⚠️ No active session.');
    return;
  }

  const count = postingSession.videosPosted.length;
  const startTime = new Date(postingSession.startedAt);
  const elapsed = Math.ceil((Date.now() - startTime.getTime()) / 60_000);

  // Sprint 1228: use readRealPosts to exclude dry-run entries from gate count
  const allPosts = readRealPosts();
  const totalPosts = allPosts.length;
  const postsLeft = Math.max(0, 30 - totalPosts);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(1, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  postingSession = { active: false, chatId: '', startedAt: '', videosPosted: [], currentVideoId: null };

  await sendMessage(chatId, [
    '🏁 *Session Complete!*',
    '',
    `📦 Videos posted: *${count}*`,
    `⏱️ Duration: ${elapsed} min`,
    '',
    `📊 Gate: ${totalPosts}/30 posts`,
    postsLeft > 0 ? `⏳ ${postsLeft} more needed · ${daysLeft}d to Apr 7` : '🎉 Post target met!',
    count > 0 ? `\n_Great work! Run_ \`/updateviews\` _tomorrow to check performance._` : '',
  ].join('\n'));
}

export async function cmdMenu(chatId: string): Promise<void> {
  const text = `📱 *Quick Menu*\n\nTap any button below:`;
  const buttons = [
    [
      { text: '📦 Deliver', callback_data: 'cmd:/deliver 1' },
      { text: '📊 Gate', callback_data: 'cmd:/gate' },
      { text: '🔥 Streak', callback_data: 'cmd:/streak' },
    ],
    [
      { text: '📋 Queue', callback_data: 'cmd:/queue' },
      { text: '📅 Today', callback_data: 'cmd:/today' },
      { text: '🏃 Pace', callback_data: 'cmd:/pace' },
    ],
    [
      { text: '📈 Analytics', callback_data: 'cmd:/analytics' },
      { text: '🔄 Last Run', callback_data: 'cmd:/lastrun' },
      { text: '🤖 Auto-post', callback_data: 'cmd:/autopost' },
    ],
    [
      { text: '🚀 Go Live', callback_data: 'cmd:/golive' },
      { text: '💰 Revenue', callback_data: 'cmd:/revenue' },
      { text: '📊 Status', callback_data: 'cmd:/status' },
    ],
    [
      { text: '📝 Digest', callback_data: 'cmd:/digest' },
      { text: '🔄 Refresh', callback_data: 'cmd:/refresh' },
      { text: '❓ Help', callback_data: 'cmd:/help' },
    ],
    [
      { text: '🚀 Boot Crons', callback_data: 'cmd:/boot' },
      { text: '🛑 Shutdown', callback_data: 'cmd:/shutdown' },
    ],
  ];
  await sendMessageWithButtons(chatId, text, buttons);
}
