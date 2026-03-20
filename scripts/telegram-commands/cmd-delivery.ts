/**
 * Telegram bot commands — video delivery, publishing, pickup, broadcast.
 * Extracted from telegram-bot.ts (Sprint 496).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { sendMessage, sendMessageWithButtons, sendVideoFile, sendVideoWithButtons } from './telegram-api';
import {
  ROOT, readLines, findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived,
} from './shared';

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
  const diversified = diversifyByHook(speakerDiversified, hookMap);
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

  const gate = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl')).length;
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
  const ready = diversifyByHook(speakerDiversified, hookMap);

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
  const gate = recorded.length;
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

    await sendMessage(chatId, '```\n' + caption + '\n```');
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

export async function cmdProduce(chatId: string): Promise<void> {
  await sendMessage(chatId, `🎬 *Producing video...*\n\nUsing local TTS + FFmpeg captions ($0.00).\nThis takes 2-3 minutes.`);
  const { spawn } = require('child_process');
  const pipelineScript = path.join(ROOT, 'scripts', 'scs001', 'run-full-pipeline.ts');
  const child = spawn('npx', ['ts-node', '--transpile-only', pipelineScript, '--mock', '--local', '--limit', '1'], {
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
        const runsDir = path.join(ROOT, 'workspace', 'scs001', 'pipeline-runs');
        const reports = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f: string) => f.startsWith('pipeline-') && f.endsWith('.json')).sort() : [];
        let reportSummary = '';
        if (reports.length > 0) {
          try {
            const report = JSON.parse(fs.readFileSync(path.join(runsDir, reports[reports.length - 1]), 'utf-8'));
            reportSummary = `\n\n📊 ${report.summary}`;
          } catch { /* skip */ }
        }
        await sendMessage(chatId, `✅ *Video produced!*${reportSummary}\n\nUse /postnow to get the video.`);
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
