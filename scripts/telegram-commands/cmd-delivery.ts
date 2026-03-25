/**
 * Telegram bot commands — video delivery, publishing, pickup, broadcast.
 * Extracted from telegram-bot.ts (Sprint 496).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { sendMessage, sendMessageWithButtons, sendVideoFile, sendVideoWithButtons } from './telegram-api';
import {
  ROOT, readLines, readRealPosts, findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, loadTopicMap, diversifyByTopic,
} from './shared';
import { buildEngagementCaption } from '../scs001/engagement-caption';

export async function cmdDeliver(chatId: string, args: string): Promise<string> {
  const count = Math.min(Math.max(parseInt(args) || 3, 1), 10);

  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const ledgerDates = new Map<string, string>();
  for (const e of ledger as any[]) {
    if (e.video_id && e.published_at) ledgerDates.set(e.video_id, e.published_at);
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id)
    .sort((a: any, b: any) =>
      freshnessScore(b.video_id, viralScores.get(b.video_id) ?? 0, ledgerDates) -
      freshnessScore(a.video_id, viralScores.get(a.video_id) ?? 0, ledgerDates)
    );

  const ready = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  if (ready.length === 0) {
    return `📦 *Deliver* — No ready-to-post videos found.\n\nRun the pipeline first, then try again.`;
  }

  const speakerMap = loadSpeakerMap();
  const speakerDiversified = diversifyBySpeaker(ready, speakerMap);
  const hookMap = loadHookMap();
  const hookDiversified = diversifyByHook(speakerDiversified, hookMap);
  const topicMap = loadTopicMap();
  const diversified = diversifyByTopic(hookDiversified, topicMap);
  const batch = diversified.slice(0, count);
  let sent = 0;

  await sendMessage(chatId, `📦 *Delivering ${batch.length} videos for posting...*`);

  for (const entry of batch) {
    const videoId = entry.video_id;
    const mp4Path = findCaptionedMp4(videoId);
    if (!mp4Path) continue;

    const caption = buildTikTokCaption(videoId);
    const vs = viralScores.get(videoId);
    const vsStr = vs != null ? `🧬 ${vs}` : '';
    const speaker = speakerMap.get(videoId);
    const spkStr = speaker ? `🎙️ ${speaker}` : '';
    const pubAt = ledgerDates.get(videoId);
    const ageDays = pubAt ? Math.round((Date.now() - new Date(pubAt).getTime()) / 86_400_000) : 0;
    const ageStr = ageDays > 0 ? ` · ${ageDays}d old` : '';
    const hook = hookMap.get(videoId);
    const hookStr = hook ? ` · 🎣 ${hook}` : '';
    const tgCaption = `📦 *Post this to TikTok* ${vsStr} ${spkStr}${hookStr}${ageStr}\n\n${caption}\n\n\`/record ${videoId} 0\``;

    const deliverButtons = [
      [
        { text: '✅ Posted', callback_data: `posted:${videoId}` },
        { text: '📡 Publish', callback_data: `cmd:/publish ${videoId}` },
      ],
      [
        { text: '📋 Caption', callback_data: `cmd:/caption ${videoId}` },
        { text: '⏭️ Next', callback_data: 'cmd:/deliver 1' },
      ],
    ];
    try {
      await sendVideoWithButtons(chatId, mp4Path, tgCaption, deliverButtons);
      sent++;
    } catch (err: any) {
      await sendMessage(chatId, `⚠️ Failed to send \`${videoId}\`: ${err.message}`);
    }
  }

  const gate = readRealPosts().length;
  const remaining = Math.max(0, 30 - gate);

  return (
    `✅ *Delivered ${sent}/${batch.length} videos*\n\n` +
    `📊 Gate progress: ${gate}/30 posts (${remaining} more needed)\n` +
    `_After posting each video, run:_\n` +
    `\`/record <video_id> <views>\``
  );
}

export async function cmdPublish(chatId: string, args: string): Promise<void> {
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
  const BLOTATO_KEY = process.env.BLOTATO_API_KEY || '';
  const isDryRun = !BLOTATO_KEY;
  const PLATFORMS = ['tiktok', 'instagram', 'youtube'] as const;

  let videoId = args.trim();
  if (!videoId) {
    const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
    const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
    const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
    const viralScores = new Map<string, number>();
    const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
    if (fs.existsSync(expPath)) {
      try {
        for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
          if (!line.trim()) continue;
          try { const e = JSON.parse(line); const id = e.clip_id ?? e.video_id; if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score); } catch {}
        }
      } catch {}
    }
    const unposted = (ledger as any[])
      .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && findCaptionedMp4(e.video_id))
      .sort((a: any, b: any) => (viralScores.get(b.video_id) ?? 0) - (viralScores.get(a.video_id) ?? 0));
    if (unposted.length === 0) {
      await sendMessage(chatId, `📡 *Publish* — No ready-to-post videos found.\n\nRun /refresh first.`);
      return;
    }
    videoId = unposted[0].video_id;
  }

  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    await sendMessage(chatId, `❌ Video \`${videoId}\` not found or not captioned.`);
    return;
  }

  const caption = buildTikTokCaption(videoId);
  const exp = getExperimentData(videoId);
  const modeStr = isDryRun ? '🧪 DRY RUN' : '🔴 LIVE';
  await sendMessage(chatId, `📡 *Publishing ${modeStr}*\n\n🎬 \`${videoId}\`\n🎙️ ${exp.speaker}\n🎯 ${PLATFORMS.join(', ')}\n\n⏳ Uploading to Supabase...`);

  let publicUrl = '';
  if (!isDryRun && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const fileBuffer = fs.readFileSync(mp4Path);
      const storagePath = `publish/${videoId}.mp4`;
      const bucket = 'scs001-videos';
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`;

      const uploadRes = await new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
        const url = new URL(uploadUrl);
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'video/mp4',
            'Content-Length': fileBuffer.length,
            'x-upsert': 'true',
          },
          timeout: 60000,
        }, (res) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c.toString()));
          res.on('end', () => resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Upload timeout')); });
        req.write(fileBuffer);
        req.end();
      });

      if (!uploadRes.ok) throw new Error(`Supabase upload ${uploadRes.status}: ${uploadRes.body.slice(0, 200)}`);
      publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
    } catch (err: any) {
      await sendMessage(chatId, `⚠️ Supabase upload failed: ${err.message}\n\nFalling back to dry-run.`);
      publicUrl = '';
    }
  }

  if (isDryRun || !publicUrl) {
    const lines = [
      `📡 *Publish — DRY RUN*`,
      ``,
      `🎬 Video: \`${videoId}\``,
      `🎙️ Speaker: ${exp.speaker}`,
      `🧬 Score: ${exp.viral_score ?? '—'}`,
      `🎣 Hook: ${exp.hook_formula}`,
      ``,
      `*Would publish to:*`,
      ...PLATFORMS.map(p => `  ✅ ${p}`),
      ``,
      `*Caption:*`,
      caption.slice(0, 200) + (caption.length > 200 ? '...' : ''),
      ``,
      `⚙️ Set \`BLOTATO_API_KEY\` in .env to publish live.`,
    ];
    await sendMessageWithButtons(chatId, lines.join('\n'), [
      [{ text: '✅ Record as Posted', callback_data: `posted:${videoId}` }],
      [{ text: '📋 Caption', callback_data: `cmd:/caption ${videoId}` }],
    ]);
    return;
  }

  try {
    const blotatoBody = JSON.stringify({
      content: caption,
      media_url: publicUrl,
      media_type: 'video',
      platforms: [...PLATFORMS],
      hashtags: [],
    });

    const blotatoRes = await new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.blotato.com',
        path: '/v1/posts',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BLOTATO_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(blotatoBody),
        },
        timeout: 30000,
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Blotato timeout')); });
      req.write(blotatoBody);
      req.end();
    });

    if (!blotatoRes.ok) throw new Error(`Blotato ${blotatoRes.status}: ${blotatoRes.body.slice(0, 200)}`);

    let platformResults = '';
    try {
      const parsed = JSON.parse(blotatoRes.body);
      if (parsed.platforms) {
        platformResults = (parsed.platforms as any[]).map((p: any) =>
          `  ${p.success ? '✅' : '❌'} ${p.platform}${p.post_url ? ` — ${p.post_url}` : ''}`
        ).join('\n');
      }
    } catch { platformResults = '  ✅ Published (details unavailable)'; }

    const postEntry = {
      video_id: videoId,
      posted_at: new Date().toISOString(),
      views: 0,
      method: 'blotato',
      platforms: [...PLATFORMS],
      public_url: publicUrl,
    };
    const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    fs.appendFileSync(manualPostsPath, JSON.stringify(postEntry) + '\n');

    await sendMessageWithButtons(chatId, [
      `📡 *Published!*`,
      ``,
      `🎬 \`${videoId}\``,
      `🎙️ ${exp.speaker} · 🧬 ${exp.viral_score ?? '—'}`,
      ``,
      `*Platforms:*`,
      platformResults,
      ``,
      `✅ Recorded in posting log.`,
    ].join('\n'), [
      [{ text: '📡 Publish Next', callback_data: 'cmd:/publish' }],
      [{ text: '🔥 Streak', callback_data: 'cmd:/streak' }, { text: '📊 Gate', callback_data: 'cmd:/gate' }],
    ]);

  } catch (err: any) {
    await sendMessage(chatId, `❌ *Publish failed:* ${err.message}\n\nVideo uploaded to Supabase OK. Try again or post manually.`);
  }
}

export async function cmdPostNow(chatId: string): Promise<void> {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));

  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const ready: Array<{ video_id: string; filePath: string; score: number }> = [];
  for (const e of ledger as any[]) {
    if (!e.video_id || recordedIds.has(e.video_id)) continue;
    const mp4 = findCaptionedMp4(e.video_id);
    if (mp4) {
      ready.push({ video_id: e.video_id, filePath: mp4, score: viralScores.get(e.video_id) ?? -1 });
    }
  }
  ready.sort((a, b) => b.score - a.score);

  if (ready.length === 0) {
    await sendMessage(chatId, '⚠️ *No ready videos found.* Run /refresh to generate new content.');
    return;
  }

  const best = ready[0];
  const caption = buildTikTokCaption(best.video_id);
  const exp = getExperimentData(best.video_id);

  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postCount = recorded.length;
  const postsNeeded = Math.max(0, 30 - postCount);

  const header = [
    `🎬 *Post Now* — ${postCount}/30 posts · ${daysLeft}d to gate`,
    '',
    `🎙️ ${exp.speaker} · 🧬 ${exp.viral_score ?? 'n/a'}`,
    `🎣 ${exp.hook_formula}`,
    '',
    '📋 *Caption (copy & paste):*',
    '```',
    caption,
    '```',
    '',
    `After posting: \`/record ${best.video_id} 0\``,
    `Queue: ${ready.length} more ready`,
  ].join('\n');

  await sendMessage(chatId, header);

  try {
    await sendVideoFile(chatId, best.filePath, `${exp.speaker} · /record ${best.video_id} 0`);
  } catch (err) {
    await sendMessage(chatId, `⚠️ Could not send video: ${(err as Error).message?.slice(0, 100)}`);
  }
}

export async function cmdPickup(chatId: string): Promise<void> {
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set(recorded.map((e: any) => e.video_id).filter(Boolean));
  const archivedIds = loadArchived();

  const viralScores = new Map<string, number>();
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  if (fs.existsSync(expPath)) {
    try {
      for (const line of fs.readFileSync(expPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          const id = e.clip_id ?? e.video_id;
          if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const ledgerDates = new Map<string, string>();
  for (const e of ledger as any[]) {
    if (e.video_id && e.published_at) ledgerDates.set(e.video_id, e.published_at);
  }

  const unposted = (ledger as any[])
    .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && !archivedIds.has(e.video_id))
    .sort((a: any, b: any) =>
      freshnessScore(b.video_id, viralScores.get(b.video_id) ?? 0, ledgerDates) -
      freshnessScore(a.video_id, viralScores.get(a.video_id) ?? 0, ledgerDates)
    );

  const readyRaw = unposted.filter((e: any) => findCaptionedMp4(e.video_id) !== null);

  if (readyRaw.length === 0) {
    await sendMessage(chatId, '📦 *Pickup* — No ready-to-post videos.\n\nRun `/refresh` to generate new content.');
    return;
  }

  const speakerMap = loadSpeakerMap();
  const speakerDiversified = diversifyBySpeaker(readyRaw, speakerMap);
  const hookMap = loadHookMap();
  const hookDiversified = diversifyByHook(speakerDiversified, hookMap);
  const topicMap = loadTopicMap();
  const ready = diversifyByTopic(hookDiversified, topicMap);

  const pick = ready[0];
  const videoId = pick.video_id;
  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    await sendMessage(chatId, '⚠️ Video file not found on disk.');
    return;
  }

  const caption = buildTikTokCaption(videoId);
  const vs = viralScores.get(videoId);
  const speaker = speakerMap.get(videoId);
  const spkStr = speaker ? ` · 🎙️ ${speaker}` : '';
  const vsStr = vs != null ? ` · 🧬 ${vs}` : '';
  const pubAt = ledgerDates.get(videoId);
  const ageDays = pubAt ? Math.round((Date.now() - new Date(pubAt).getTime()) / 86_400_000) : 0;
  const ageStr = ageDays > 0 ? ` · ${ageDays}d` : '';
  const hook = hookMap.get(videoId);
  const hookStr = hook ? ` · 🎣 ${hook}` : '';
  const gate = readRealPosts().length;
  const remaining = Math.max(0, 30 - gate);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  const tgCaption = [
    `🎬 *Next Post* (#${gate + 1}/30)${vsStr}${spkStr}${hookStr}${ageStr}`,
    '',
    caption,
    '',
    `📊 ${remaining - 1} more needed · ${daysLeft}d to gate`,
    `📦 ${ready.length - 1} more in queue`,
  ].join('\n');

  const pickupButtons = [
    [
      { text: '✅ Posted', callback_data: `posted:${videoId}` },
      { text: '⏭ Next Video', callback_data: 'cmd:/pickup' },
    ],
    [
      { text: '🗑 Archive', callback_data: `cmd:/archive ${videoId}` },
      { text: '📊 Progress', callback_data: 'cmd:/progress' },
    ],
  ];
  try {
    await sendVideoWithButtons(chatId, mp4Path, tgCaption, pickupButtons);
  } catch (err: any) {
    await sendMessage(chatId, `⚠️ Failed to send video: ${err.message}`);
  }
}

export async function cmdTodayCaptions(chatId: string): Promise<void> {
  const schedulePath = path.join(ROOT, 'reports', 'posting-schedule.json');
  if (!fs.existsSync(schedulePath)) {
    await sendMessage(chatId, '⚠️ No posting schedule found. Run /refresh first.');
    return;
  }

  let sched: any;
  try {
    sched = JSON.parse(fs.readFileSync(schedulePath, 'utf-8'));
  } catch {
    await sendMessage(chatId, '⚠️ Could not parse posting-schedule.json.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = (sched.slots ?? []).filter((s: any) => s.date === today);

  if (todaySlots.length === 0) {
    await sendMessage(chatId, `📅 No posts scheduled for today (${today}).\n\nUse /postplan for the full schedule.`);
    return;
  }

  await sendMessage(chatId, [
    `📋 *Today's Captions* (${today})`,
    `${todaySlots.length} post(s) scheduled`,
    '',
    `🎯 ${sched.posts_needed ?? 30} posts needed in ${sched.days_to_gate ?? '?'}d`,
  ].join('\n'));

  for (const slot of todaySlots) {
    const caption = buildTikTokCaption(slot.video_id);
    const score = Math.round((slot.viral_score ?? 0) * 100);

    await sendMessage(chatId, [
      `⏰ *${slot.slot_label ?? slot.time}*`,
      `🎬 \`${slot.video_id}\``,
      slot.speaker ? `🎙️ ${slot.speaker}` : '',
      `📊 Viral: ${score}% | Hook: ${slot.hook ?? '?'}`,
    ].filter(Boolean).join('\n'));

    // Sprint 805: Send video file directly for easy forwarding
    const mp4Path = findCaptionedMp4(slot.video_id);
    if (mp4Path && fs.existsSync(mp4Path)) {
      try {
        await sendVideoFile(chatId, mp4Path, caption.slice(0, 1024));
      } catch {
        await sendMessage(chatId, '```\n' + caption + '\n```');
      }
    } else {
      await sendMessage(chatId, '```\n' + caption + '\n```');
    }

    await sendMessage(chatId, `_After posting: \`/record ${slot.video_id} 0\`_`);
  }
}

export async function cmdBroadcast(chatId: string, message: string): Promise<void> {
  if (!message.trim()) {
    await sendMessage(chatId, [
      '📢 *Broadcast to Alpha Users*',
      '',
      'Usage: `/broadcast Your message here`',
      '',
      '_Message will be sent to all alpha-whitelisted + waitlisted users._',
    ].join('\n'));
    return;
  }

  const recipientIds = new Set<string>();
  const files = [
    path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl'),
    path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl'),
  ];

  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const id = entry.chatId ?? entry.chat_id;
        if (id) recipientIds.add(String(id));
      } catch { /* skip */ }
    }
  }

  recipientIds.delete(chatId);

  if (recipientIds.size === 0) {
    await sendMessage(chatId, '⚠️ No alpha users to broadcast to. Use /invite first.');
    return;
  }

  await sendMessage(chatId, `📢 *Broadcasting to ${recipientIds.size} user(s)...*\n\n"${message.slice(0, 200)}${message.length > 200 ? '...' : ''}"`);

  let sent = 0;
  let failed = 0;
  const broadcastText = `📢 *Achiri Update*\n\n${message}`;

  for (const userId of Array.from(recipientIds)) {
    try {
      await sendMessage(userId, broadcastText);
      sent++;
      await new Promise(r => setTimeout(r, 200));
    } catch {
      failed++;
    }
  }

  const logPath = path.join(ROOT, 'workspace', 'achiri', 'broadcast-log.jsonl');
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    message: message.slice(0, 500),
    recipients: recipientIds.size,
    sent,
    failed,
  }) + '\n');

  await sendMessage(chatId, `✅ Broadcast complete: *${sent}* sent, *${failed}* failed`);
}

export async function cmdRefresh(chatId: string): Promise<void> {
  await sendMessage(chatId, `🔄 *Pipeline refresh starting...*\n\nThis takes 2-5 minutes. I'll notify you when it's done.`);
  const { spawn } = require('child_process');
  const pipelineScript = path.join(ROOT, 'agents', 'scs001-orchestrator', 'run-pipeline.ts');
  const child = spawn('npx', ['ts-node', '--transpile-only', pipelineScript, 'mock'], {
    cwd: ROOT,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
  child.on('close', async (code: number) => {
    try {
      if (code === 0) {
        const latestPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
        let stats = '';
        if (fs.existsSync(latestPath)) {
          try {
            const report = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
            const stages = report.stages ?? {};
            const discovered = stages.discovery?.count ?? '?';
            const captioned = stages.captioning?.count ?? stages.caption?.count ?? '?';
            stats = `\n\n📊 Discovered: ${discovered} · Captioned: ${captioned}`;
            if (report.total_elapsed_ms) stats += ` · ${Math.round(report.total_elapsed_ms / 1000)}s`;
          } catch { /* skip */ }
        }
        await sendMessage(chatId, `✅ *Pipeline refresh complete!*${stats}\n\nRegenerating calendar...`);
        try {
          const { execSync } = require('child_process');
          execSync('npx ts-node --transpile-only scripts/scs001/generate-content-calendar.ts', { cwd: ROOT, timeout: 30000, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' } });
          execSync('npx ts-node --transpile-only scripts/scs001/generate-posting-schedule.ts', { cwd: ROOT, timeout: 30000, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' } });
          await sendMessage(chatId, `📅 *Calendar + schedule regenerated!*\n\nUse /pickup to post next video.`);
        } catch (regenErr: any) {
          await sendMessage(chatId, `⚠️ Calendar regen failed (non-fatal): ${(regenErr as Error).message?.slice(0, 100)}\n\nVideos still available via /deliver.`);
        }
      } else {
        const errSnippet = (stderr || stdout).slice(-300);
        await sendMessage(chatId, `❌ *Pipeline failed* (exit ${code})\n\n\`\`\`\n${errSnippet}\n\`\`\``);
      }
    } catch { /* notification failed */ }
  });
  child.on('error', async (err: Error) => {
    try { await sendMessage(chatId, `❌ *Pipeline spawn failed:* ${err.message}`); } catch {}
  });
}

export async function cmdProduce(chatId: string, args?: string): Promise<void> {
  // Sprint 801: Rewired to use multiformat pipeline (batch-produce.ts) instead of old run-full-pipeline.ts
  const count = Math.min(10, Math.max(1, parseInt(args?.trim() || '3', 10) || 3));

  await sendMessage(chatId, `🎬 *Producing ${count} video${count > 1 ? 's' : ''}...*\n\nMultiformat pipeline: topic radar → script → TTS → avatar → composite → captions.\nEst. ${count * 1}-${count * 2} minutes. Cost: ~$0.30/video.`);
  const { spawn } = require('child_process');
  const batchScript = path.join(ROOT, 'scripts', 'scs001', 'batch-produce.ts');
  const child = spawn('npx', ['ts-node', '--transpile-only', batchScript, '--runs', String(count)], {
    cwd: ROOT,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  let stdout = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { /* ignore */ });
  child.on('close', async (code: number) => {
    try {
      if (code === 0) {
        // Parse batch summary from stdout
        const newMatch = stdout.match(/New videos:\s*(\d+)/);
        const newVideos = newMatch ? parseInt(newMatch[1]) : 0;
        const runsMatch = stdout.match(/Runs:\s*(\d+)\/(\d+)/);
        const successRuns = runsMatch ? parseInt(runsMatch[1]) : 0;

        let msg = `✅ *${newVideos} video${newVideos !== 1 ? 's' : ''} produced!* (${successRuns}/${count} runs)`;

        // Read latest report for gate status
        const reportPath = path.join(ROOT, 'reports', 'batch-produce-latest.json');
        if (fs.existsSync(reportPath)) {
          try {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            if (report.total_new_videos != null) {
              msg += `\n\n📊 New: ${report.total_new_videos} videos`;
            }
          } catch {}
        }

        // Auto-deliver if produced > 0
        if (newVideos > 0) {
          try {
            const { execSync } = require('child_process');
            execSync(`npx ts-node --transpile-only scripts/scs001/posting-auto-deliver.ts --batch ${Math.min(newVideos, 5)}`, {
              cwd: ROOT, timeout: 120000, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
            });
            msg += `\n\n📬 Auto-delivered ${Math.min(newVideos, 5)} videos to Telegram.`;
          } catch { msg += '\n\n⚠️ Auto-deliver failed. Use /deliver manually.'; }
        }

        msg += '\n\nUse /deliver to get videos for posting.';
        await sendMessage(chatId, msg);
      } else {
        const lastLines = stdout.split('\n').filter((l: string) => l.trim()).slice(-5).join('\n');
        await sendMessage(chatId, `❌ *Pipeline failed* (exit ${code})\n\n\`\`\`\n${lastLines.slice(0, 500)}\n\`\`\``);
      }
    } catch (err: any) {
      try { await sendMessage(chatId, `❌ *Pipeline error:* ${err.message}`); } catch {}
    }
  });
  child.on('error', async (err: Error) => {
    try { await sendMessage(chatId, `❌ *Pipeline spawn failed:* ${err.message}`); } catch {}
  });
}

// Sprint 483: Instagram Reels cross-posting (manual workflow)
export async function cmdInstagram(chatId: string, args: string): Promise<void> {
  const videoId = args.trim().split(/\s+/)[0];

  if (!videoId) {
    await sendMessage(chatId, '📸 *Instagram Reels*\n\nUsage: /instagram <video_id>\n\nOr run /deliver first, then use the video ID.');
    return;
  }

  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    await sendMessage(chatId, `❌ Video \`${videoId}\` not found. Run the pipeline first.`);
    return;
  }

  // Build Instagram-optimized caption from TikTok caption
  const tiktokCaption = buildTikTokCaption(videoId);
  const igCaption = buildInstagramCaption(tiktokCaption);

  const igButtons = [
    [
      { text: '✅ Posted to IG', callback_data: `ig_posted:${videoId}` },
      { text: '📋 Copy Caption', callback_data: `cmd:/caption ${videoId}` },
    ],
    [
      { text: '🎵 TikTok Version', callback_data: 'cmd:/deliver 1' },
    ],
  ];

  try {
    await sendVideoWithButtons(chatId, mp4Path, `📸 *Post this to Instagram Reels*\n\n${igCaption}`, igButtons);
  } catch (err: any) {
    await sendMessage(chatId, `❌ Failed to send: ${err.message}`);
  }
}

function buildInstagramCaption(tiktokCaption: string): string {
  const lines = tiktokCaption.split('\n').filter(l => l.trim());
  const textLines: string[] = [];
  const tiktokHashtags: string[] = [];

  for (const line of lines) {
    const tags = line.match(/#\w+/g);
    if (tags && tags.length > 2) {
      tiktokHashtags.push(...tags);
    } else {
      textLines.push(line);
    }
  }

  // Instagram: fewer hashtags (8 max), add IG-specific, drop TikTok-only tags
  const igSpecific = ['#reels', '#explore', '#trending', '#viral'];
  const selectedTags = tiktokHashtags
    .filter(t => !['#fyp', '#foryou', '#foryoupage', '#tiktok'].includes(t.toLowerCase()))
    .slice(0, 6);
  const tagSet = new Set([...selectedTags, ...igSpecific]);
  const allTags = Array.from(tagSet).slice(0, 10);

  // IG format: text + spacer dots + hashtags
  const caption = textLines.join('\n');
  return `${caption}\n\n.\n.\n.\n\n${allTags.join(' ')}`;
}

// ── Sprint 603: Video Inventory & Batch Delivery ──────────────────────

export function cmdInventory(): string {
  const inventoryPath = path.join(ROOT, 'reports', 'video-inventory.json');

  // Auto-regenerate inventory
  try {
    const { execSync } = require('child_process');
    execSync('npx ts-node --transpile-only scripts/scs001/scan-video-inventory.ts', {
      cwd: ROOT, timeout: 30000, stdio: 'pipe',
    });
  } catch { /* try to read whatever exists */ }

  if (!fs.existsSync(inventoryPath)) {
    return '⚠️ No video inventory. Run: `npx ts-node scripts/scs001/scan-video-inventory.ts`';
  }

  let inv: any;
  try {
    inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
  } catch {
    return '⚠️ Could not parse video-inventory.json';
  }

  const lines: string[] = [];
  lines.push('📦 *Video Inventory*');
  lines.push(`Scanned: ${inv.total_runs ?? 0} runs · ${inv.total_videos ?? 0} total videos`);
  lines.push(`Unique topics: ${inv.unique_topics ?? 0}`);
  lines.push(`Ready to post: ${inv.ready_to_post ?? 0}`);
  lines.push(`Already posted: ${inv.already_posted ?? 0}`);
  lines.push('');

  const g = inv.gate_status ?? {};
  const gap = g.gap ?? 30;
  lines.push(`🎯 *Gate: ${g.posted ?? 0}/30 posts* (${gap} to go)`);
  lines.push('');

  if (inv.videos?.length > 0) {
    lines.push('*Videos (best per topic):*');
    for (const v of inv.videos.slice(0, 15)) {
      const status = v.posted ? '✅' : '⏳';
      lines.push(`${status} [${v.format}] ${v.title?.slice(0, 40)} (${v.duration_s}s)`);
    }
    if (inv.videos.length > 15) {
      lines.push(`... +${inv.videos.length - 15} more`);
    }
  }

  return lines.join('\n');
}

export async function cmdBatchDeliver(chatId: string, args: string): Promise<string> {
  const count = Math.min(Math.max(parseInt(args) || 5, 1), 15);

  // Regenerate inventory first
  try {
    const { execSync } = require('child_process');
    execSync('npx ts-node --transpile-only scripts/scs001/scan-video-inventory.ts', {
      cwd: ROOT, timeout: 30000, stdio: 'pipe',
    });
  } catch { /* continue with existing */ }

  const inventoryPath = path.join(ROOT, 'reports', 'video-inventory.json');
  if (!fs.existsSync(inventoryPath)) {
    return '⚠️ No inventory. Run the pipeline first to generate videos.';
  }

  let inv: any;
  try {
    inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
  } catch {
    return '⚠️ Could not parse video-inventory.json';
  }

  const unposted = (inv.videos ?? []).filter((v: any) => !v.posted);
  if (unposted.length === 0) {
    return '✅ All videos have been posted! Generate more with the pipeline.';
  }

  const toDeliver = unposted.slice(0, count);
  let sent = 0;

  for (const v of toDeliver) {
    const videoPath = v.video_path;
    if (!videoPath || !fs.existsSync(videoPath)) {
      await sendMessage(chatId, `⚠️ ${v.video_id}: video file not found`);
      continue;
    }

    // Sprint 841: Use engagement caption for copy-paste-ready TikTok posting
    const engCaption = buildEngagementCaption({
      videoId: v.video_id,
      topic: v.title,
    });
    const caption = `📹 *${v.title}*\n${v.format} · ${v.duration_s}s · \`${v.video_id}\`\n\n📋 *TikTok Caption (copy-paste):*\n${engCaption}\n\n✅ After posting: /done ${v.video_id}`;

    try {
      await sendVideoFile(chatId, videoPath, caption);
      sent++;
    } catch (err: any) {
      await sendMessage(chatId, `⚠️ ${v.video_id}: send failed — ${err.message?.slice(0, 100)}`);
    }
  }

  return `📦 Batch delivery: ${sent}/${toDeliver.length} videos sent.\nGate: ${inv.gate_status?.posted ?? 0}/30 · ${unposted.length - sent} remaining in queue.`;
}

export async function cmdStockpile(chatId: string, args: string): Promise<void> {
  const count = Math.min(Math.max(parseInt(args) || 3, 1), 10);

  await sendMessage(chatId, `🏭 *Stockpiling ${count} batch runs...*\nMultiformat pipeline (local TTS $0 + avatars ~$0.25/video).\nETA: ${count * 40}-${count * 60}s`);

  const { spawn } = require('child_process');
  const child = spawn('npx', [
    'ts-node', '--transpile-only',
    'scripts/scs001/batch-produce.ts',
    '--runs', String(count),
  ], {
    cwd: ROOT,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdout = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { /* ignore */ });

  child.on('close', async (code: number) => {
    try {
      if (code === 0) {
        // Read inventory for summary
        const invPath = path.join(ROOT, 'reports', 'video-inventory.json');
        let summary = `✅ Stockpile complete (${count} runs).`;
        if (fs.existsSync(invPath)) {
          try {
            const inv = JSON.parse(fs.readFileSync(invPath, 'utf-8'));
            summary += `\n📦 Unique videos: ${inv.unique_topics ?? '?'}`;
            summary += `\n🎯 Gate: ${inv.gate_status?.posted ?? 0}/30 (${inv.gate_status?.gap ?? '?'} to go)`;
            summary += `\n⏳ Ready to post: ${inv.ready_to_post ?? '?'}`;
          } catch { /* skip */ }
        }
        await sendMessage(chatId, summary);
      } else {
        await sendMessage(chatId, `❌ Stockpile failed (exit ${code}).\n\`\`\`\n${stdout.slice(-500)}\n\`\`\``);
      }
    } catch (e: any) {
      await sendMessage(chatId, `❌ Stockpile error: ${e.message?.slice(0, 200)}`);
    }
  });
}

// Sprint 694: Broadcast kill switch — AMD-17
const BROADCAST_STATE_PATH = path.join(ROOT, 'workspace', 'broadcast-state.json');

function getBroadcastState(): { live: boolean; paused_at?: string; paused_by?: string } {
  try {
    return JSON.parse(fs.readFileSync(BROADCAST_STATE_PATH, 'utf-8'));
  } catch {
    return { live: process.env.BROADCAST_LIVE === 'true' };
  }
}

function setBroadcastState(live: boolean, by: string): void {
  const state = {
    live,
    [live ? 'resumed_at' : 'paused_at']: new Date().toISOString(),
    [live ? 'resumed_by' : 'paused_by']: by,
  };
  fs.writeFileSync(BROADCAST_STATE_PATH, JSON.stringify(state, null, 2));
}

export async function cmdBroadcastPause(chatId: string): Promise<void> {
  const state = getBroadcastState();
  if (!state.live) {
    await sendMessage(chatId, '⏸️ Broadcast is already PAUSED.');
    return;
  }
  setBroadcastState(false, chatId);
  await sendMessage(chatId, '⏸️ *Broadcast PAUSED*\n\nNo broadcast messages will be sent until `/broadcast-resume` is called.\n\nBROADCAST_LIVE = false');
}

export async function cmdBroadcastResume(chatId: string): Promise<void> {
  const state = getBroadcastState();
  if (state.live) {
    await sendMessage(chatId, '▶️ Broadcast is already LIVE.');
    return;
  }
  setBroadcastState(true, chatId);
  await sendMessage(chatId, '▶️ *Broadcast RESUMED*\n\nBroadcast messages are now LIVE.\n\nBROADCAST_LIVE = true');
}

export function isBroadcastLive(): boolean {
  return getBroadcastState().live;
}

/**
 * /post-browser — Sprint 785: Post video to TikTok via Browser Use
 * Usage: /post-browser [video_id]
 * If no video_id, picks highest-scored unposted video.
 */
export async function cmdPostBrowser(chatId: string, args: string): Promise<void> {
  const venvPath = path.join(ROOT, '.venv-browser-use');
  if (!fs.existsSync(venvPath)) {
    await sendMessage(chatId, '❌ Browser Use not installed.\n\nRun: `bash scripts/scs001/install-browser-use.sh`');
    return;
  }

  // Check warmup
  const warmupPath = path.join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
  if (fs.existsSync(warmupPath)) {
    try {
      const ws = JSON.parse(fs.readFileSync(warmupPath, 'utf-8'));
      if (!ws.verified) {
        await sendMessage(chatId, '❌ Warmup not verified. Complete warmup first.\n\n/warmup-status');
        return;
      }
    } catch {}
  } else {
    await sendMessage(chatId, '❌ Warmup not started. Run /warmup-start first.');
    return;
  }

  // Find video
  let videoId = args.trim();
  if (!videoId) {
    const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
    const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
    const recordedIds = new Set((recorded as any[]).map((e: any) => e.video_id).filter(Boolean));
    const unposted = (ledger as any[])
      .filter((e: any) => !recordedIds.has(e.video_id) && e.video_id && findCaptionedMp4(e.video_id))
      .slice(0, 1);
    if (unposted.length === 0) {
      await sendMessage(chatId, '📡 No ready-to-post videos found. Run /refresh first.');
      return;
    }
    videoId = unposted[0].video_id;
  }

  // Find video file
  const mp4Path = findCaptionedMp4(videoId);
  if (!mp4Path) {
    await sendMessage(chatId, `❌ No MP4 found for ${videoId}`);
    return;
  }

  // Build caption
  const caption = buildTikTokCaption(videoId);

  await sendMessage(chatId, [
    '🌐 *Browser Upload Preparing...*',
    '',
    `Video: \`${videoId}\``,
    `File: \`${path.basename(mp4Path)}\``,
    `Caption: ${caption.slice(0, 100)}...`,
    '',
    'Launching Browser Use agent...',
    '(This opens Chrome — do not interact with the browser window)',
  ].join('\n'));

  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `source "${venvPath}/bin/activate" && python "${path.join(ROOT, 'scripts', 'scs001', 'post-tiktok.py')}" --video "${mp4Path}" --caption "${caption.replace(/"/g, '\\"')}" --video-id "${videoId}"`,
      { cwd: ROOT, timeout: 120_000, stdio: 'pipe', shell: '/bin/bash' }
    ).toString();

    await sendMessage(chatId, [
      '📋 *Upload Prepared*',
      '',
      `Video: \`${videoId}\``,
      '',
      'Review in browser, then:',
      '• Click Post in browser to publish',
      `• Then run: /record ${videoId} 0`,
      '',
      '_Or re-run with --post: `bash scripts/scs001/post-tiktok.sh "${mp4Path}" "${caption}" --post`_',
    ].join('\n'));
  } catch (err: any) {
    await sendMessage(chatId, `❌ Browser upload failed:\n\`${err.message?.slice(0, 300)}\``);
  }
}

/**
 * /post-auto — Sprint 803: Trigger browser auto-poster from Telegram
 * Runs auto-post-browser.ts (picks best unposted video, posts via browser)
 * Usage: /post-auto [count]
 */
export async function cmdPostAuto(chatId: string, args: string): Promise<void> {
  const count = Math.min(Math.max(parseInt(args.trim()) || 1, 1), 5);
  await sendMessage(chatId, `🤖 Starting browser auto-post (${count} video${count > 1 ? 's' : ''})...`);

  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `AUTO_POST_MAX=${count} npx ts-node --transpile-only scripts/scs001/auto-post-browser.ts`,
      { cwd: ROOT, timeout: 180_000, stdio: 'pipe', env: { ...process.env, AUTO_POST_MAX: String(count) } }
    ).toString();

    const lines = result.split('\n').filter(l => l.includes('[auto-post-browser]'));
    const summary = lines.slice(-3).join('\n') || result.slice(-300);
    await sendMessage(chatId, `✅ Auto-post complete:\n\n\`\`\`\n${summary}\n\`\`\``);
  } catch (err: any) {
    const output = err.stdout?.toString()?.slice(-300) || err.message?.slice(0, 300);
    await sendMessage(chatId, `❌ Auto-post failed:\n\`${output}\``);
  }
}

/**
 * /quickstart — Sprint 808: 5-minute posting guide
 * Sends the operator a step-by-step guide + the best video + caption, ready to post.
 */
export async function cmdQuickstart(chatId: string): Promise<void> {
  // Find best unposted video
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const delivered = readLines(path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl'));
  const recorded = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const recordedIds = new Set((recorded as any[]).map((e: any) => e.video_id).filter(Boolean));

  // Get best delivered video with file on disk
  const candidates = (delivered as any[])
    .filter((e: any) => e.video_id && !recordedIds.has(e.video_id))
    .sort((a: any, b: any) => (b.viral_score ?? 0) - (a.viral_score ?? 0));

  let bestVideo: any = null;
  let mp4Path: string | null = null;
  for (const c of candidates) {
    const p = (c.mp4_path && fs.existsSync(c.mp4_path)) ? c.mp4_path : findCaptionedMp4(c.video_id);
    if (p) {
      bestVideo = c;
      mp4Path = p;
      break;
    }
  }

  // Gate info
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, 30 - recordedIds.size);

  await sendMessage(chatId, [
    `🚀 *Quick Start: Post in 5 Minutes*`,
    '',
    `📊 Gate: ${recordedIds.size}/30 posts · ${postsLeft} remaining · ${daysLeft} days`,
    '',
    `*Step 1:* Open TikTok app on your phone`,
    `*Step 2:* Tap the + button to create a new post`,
    `*Step 3:* Upload the video I'm sending next`,
    `*Step 4:* Paste the caption (sent after the video)`,
    `*Step 5:* Post it!`,
    `*Step 6:* Run \`/record ${bestVideo?.video_id || 'VIDEO_ID'} 0\` to log it`,
    '',
    `_That's it! Repeat 2x/day to hit the gate._`,
  ].join('\n'));

  if (bestVideo && mp4Path) {
    const caption = buildTikTokCaption(bestVideo.video_id);
    try {
      await sendVideoFile(chatId, mp4Path, `🎬 Best video: \`${bestVideo.video_id}\`\nScore: ${bestVideo.viral_score ?? 'n/a'}`);
    } catch {
      await sendMessage(chatId, `🎬 Video: \`${bestVideo.video_id}\` (file too large for Telegram)`);
    }
    await sendMessage(chatId, `📋 *Caption (copy-paste):*\n\n\`\`\`\n${caption}\n\`\`\``);
    await sendMessage(chatId, `_After posting: \`/record ${bestVideo.video_id} 0\`_`);
  } else {
    await sendMessage(chatId, `⚠️ No unposted videos found with files. Run /produce first.`);
  }
}

// Sprint 820: Produce video on a custom topic
export async function cmdProduceTopic(chatId: string, args?: string): Promise<void> {
  const topic = args?.trim();
  if (!topic) {
    await sendMessage(chatId, '❌ Usage: `/produce-topic Your Topic Here`\n\nExample: `/produce-topic How GPT-5 changes coding forever`');
    return;
  }

  await sendMessage(chatId, `🎬 *Producing video on custom topic:*\n_${topic}_\n\nRunning multiformat pipeline...`);

  const { spawn } = require('child_process');
  const pipelineScript = path.join(ROOT, 'scripts', 'scs001', 'run-multiformat-pipeline.ts');
  const child = spawn('npx', ['ts-node', '--transpile-only', pipelineScript, '--topic', topic, '--max=1'], {
    cwd: ROOT,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdout = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { /* ignore */ });
  child.on('close', async (code: number) => {
    try {
      if (code === 0) {
        const videoMatch = stdout.match(/(?:videos_composited|Composited)[:.\s]*(\d+)/);
        const videoCount = videoMatch ? parseInt(videoMatch[1]) : 0;
        if (videoCount > 0) {
          await sendMessage(chatId, `✅ *${videoCount} video produced on:*\n_${topic}_\n\nUse /deliver to get it for posting.`);
        } else {
          await sendMessage(chatId, `⚠️ Pipeline ran but produced 0 videos for:\n_${topic}_\n\nTry a different topic.`);
        }
      } else {
        await sendMessage(chatId, `❌ Pipeline failed (exit ${code}) for topic:\n_${topic}_`);
      }
    } catch (err: any) {
      await sendMessage(chatId, `❌ Error: ${err.message?.slice(0, 200)}`);
    }
  });
}

/**
 * /v2 — Sprint 894: Produce a video via the v2 pipeline (Scorsese + fal.ai + Captions.ai)
 * Usage: /v2 Your Topic Here
 * Usage: /v2 (no topic = default test topic)
 */
export async function cmdV2Produce(chatId: string, args?: string): Promise<void> {
  const topic = args?.trim();
  const topicDisplay = topic || 'AI Agents Are Replacing Junior Developers (default)';

  await sendMessage(chatId, `🎬 *V2 Pipeline — producing video:*\n_${topicDisplay}_\n\n⏱️ Takes ~5-10 min (Scorsese → ArtDirector → MovieEditor)`);

  const { spawn } = require('child_process');
  const pipelineScript = path.join(ROOT, 'scripts', 'scs001', 'run-v2-pipeline.ts');
  const spawnArgs = ['ts-node', '--transpile-only', pipelineScript];
  if (topic) spawnArgs.push('--topic', topic);

  const child = spawn('npx', spawnArgs, {
    cwd: ROOT,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdout = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { /* ignore */ });
  child.on('close', async (code: number) => {
    try {
      if (code === 0) {
        const scenarioMatch = stdout.match(/Scenario: (.+)/);
        const verdictMatch = stdout.match(/Verdict: (\w+) \(msg:(\d+), scroll:(\d+)\)/);
        const videoMatch = stdout.match(/Video: (.+\.mp4)/);
        const resultMatch = stdout.match(/Result: (\w+)/);

        const status = resultMatch?.[1] || 'unknown';
        const scenario = scenarioMatch?.[1] || topicDisplay;
        const msg = verdictMatch?.[2] || '?';
        const scroll = verdictMatch?.[3] || '?';
        const videoPath = videoMatch?.[1] || '';

        if (status === 'PASS' && videoPath) {
          const lines = [
            `✅ *V2 Video Produced!*`,
            '',
            `📽️ _${scenario}_`,
            `🎯 Score: msg:${msg}/100 scroll:${scroll}/100`,
            `📁 \`${videoPath.split('/').pop()}\``,
            '',
            `Use /pickup to post it.`,
          ];
          await sendMessage(chatId, lines.join('\n'));
        } else if (status === 'REJECT') {
          await sendMessage(chatId, `⚠️ *V2 Scenario Rejected by ArtDirector*\n_${scenario}_\n\nTry a different topic.`);
        } else {
          await sendMessage(chatId, `⚠️ V2 pipeline completed with status: ${status}\n_${scenario}_`);
        }
      } else {
        const errLines = stdout.split('\n').filter((l: string) => l.includes('error') || l.includes('Error')).slice(0, 3);
        await sendMessage(chatId, `❌ V2 pipeline failed (exit ${code})\n${errLines.join('\n') || 'Check logs'}`);
      }
    } catch (err: any) {
      await sendMessage(chatId, `❌ Error: ${err.message?.slice(0, 200)}`);
    }
  });
}

// Sprint 1017: /deliver-next — send top unposted video mp4 as Telegram file
export async function cmdDeliverNext(chatId: string): Promise<void> {
  const deliveredPath = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');

  if (!fs.existsSync(deliveredPath)) {
    await sendMessage(chatId, '⚠️ No auto-delivered.jsonl found.');
    return;
  }

  const postedIds = new Set<string>(readRealPosts().map((e: any) => e.video_id).filter(Boolean));

  const candidates: Array<{ video_id: string; viral_score: number; mp4: string; topic?: string }> = [];
  fs.readFileSync(deliveredPath, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
    try {
      const e = JSON.parse(l);
      if (!e.video_id || postedIds.has(e.video_id)) return;
      const mp4 = e.mp4_path && fs.existsSync(e.mp4_path) ? e.mp4_path : findCaptionedMp4(e.video_id);
      if (mp4) candidates.push({ video_id: e.video_id, viral_score: e.viral_score ?? 0, mp4, topic: e.topic });
    } catch {}
  });

  if (candidates.length === 0) {
    await sendMessage(chatId, '⚠️ No unposted videos with mp4 found. Run /postnext to check.');
    return;
  }

  candidates.sort((a, b) => b.viral_score - a.viral_score);
  const top = candidates[0];
  const caption = buildTikTokCaption(top.video_id);

  await sendMessage(chatId, [
    `🎯 *Sending video for posting* — \`${top.video_id}\``,
    top.topic ? `📝 ${top.topic.slice(0, 70)}` : '',
    `Score: ${top.viral_score.toFixed(2)} · ${candidates.length - 1} more unposted`,
    '',
    `_Caption:_\n\`\`\`\n${caption}\n\`\`\``,
    '',
    `_After posting: \`/record ${top.video_id} 0\`_`,
  ].filter(Boolean).join('\n'));

  try {
    await sendVideoFile(chatId, top.mp4, `${top.video_id} · /record ${top.video_id} 0`);
  } catch (err: any) {
    await sendMessage(chatId, `⚠️ Could not send video file: ${err.message?.slice(0, 100)}\n📁 Path: \`${top.mp4}\``);
  }
}

/**
 * Sprint 1217: /produce-vlog [topic] — Produce a vlog-style video using produce-vlog.ts
 * Uses avatar pipeline (Captions.ai) or falls back to TTS mode.
 * Runs async, sends start/finish notifications.
 */
export async function cmdProduceVlog(chatId: string, args: string): Promise<void> {
  const topic = args.trim() || '';
  const topicDisplay = topic || 'auto-discover trending topic';

  await sendMessage(chatId, [
    `🎬 *Producing Vlog Video...*`,
    '',
    `📝 Topic: ${topicDisplay}`,
    `🎭 Pipeline: Avatar (Captions.ai) or TTS fallback`,
    `⏱️ Est. 3-8 minutes`,
    '',
    `_Will send the video when done._`,
  ].join('\n'));

  const { spawn } = require('child_process');
  const scriptPath = path.join(ROOT, 'scripts', 'scs001', 'produce-vlog.ts');
  const spawnArgs = ['ts-node', '--transpile-only', scriptPath];
  if (topic) {
    spawnArgs.push('--topic', topic);
  }

  const child = spawn('npx', spawnArgs, {
    cwd: ROOT,
    env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  child.on('close', async (code: number) => {
    try {
      if (code === 0) {
        // Parse output path from "Output: /path/to/file.mp4"
        const outputMatch = stdout.match(/Output:\s*(.+\.mp4)/);
        const mp4Path = outputMatch?.[1]?.trim();

        if (mp4Path && fs.existsSync(mp4Path)) {
          const videoId = path.basename(path.dirname(mp4Path));
          const sizeMb = (fs.statSync(mp4Path).size / 1_048_576).toFixed(1);
          await sendMessage(chatId, [
            `✅ *Vlog produced!* — \`${videoId}\``,
            `📦 Size: ${sizeMb}MB`,
            ``,
            `_Caption: /caption-next · Post: /deliver-next_`,
          ].join('\n'));
          try {
            await sendVideoFile(chatId, mp4Path, `${videoId} — /record ${videoId} 0`);
          } catch (err: any) {
            await sendMessage(chatId, `⚠️ Could not send video: ${err.message?.slice(0, 100)}\n📁 \`${mp4Path}\``);
          }
        } else {
          const lastLines = stdout.trim().split('\n').slice(-3).join('\n');
          await sendMessage(chatId, `✅ *Vlog produced* (no mp4 path found)\n\`\`\`\n${lastLines}\n\`\`\``);
        }
      } else {
        const errSnippet = (stderr || stdout).trim().split('\n').slice(-5).join('\n').slice(0, 300);
        await sendMessage(chatId, `❌ *Vlog production failed* (exit ${code})\n\`\`\`\n${errSnippet}\n\`\`\``);
      }
    } catch (e: any) {
      await sendMessage(chatId, `❌ Error handling vlog result: ${e.message}`);
    }
  });
}
