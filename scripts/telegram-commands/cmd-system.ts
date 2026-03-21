/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
} from './shared';
import { sendMessage } from './telegram-api';

export function cmdPm2(): string {
  const procs = getPm2List();
  if (!procs.length) return '❌ *PM2* — could not read process list (pm2 jlist failed)';

  const online = procs.filter(p => p.status === 'online').length;
  const lines = procs.map(p => {
    const icon = p.status === 'online' ? '🟢' : '🔴';
    const uptime = fmtUptime(p.uptimeMs);
    const mem = fmtMem(p.memory);
    const cpu = p.cpu != null ? ` CPU:${p.cpu}%` : '';
    const restarts = p.restarts > 0 ? ` ↺${p.restarts}` : '';
    return `${icon} \`${p.name}\` — ${p.status} (${uptime}${mem}${cpu}${restarts})`;
  }).join('\n');

  return `*PM2 Processes* — ${online}/${procs.length} online\n\n${lines}`;
}

export function cmdHealth(): string {
  const h = readJSON<any>(path.join(ROOT, 'health.json'));
  if (!h) return '❌ *Health* — health.json not found';

  const statusIcon = { healthy: '✅', degraded: '⚠️', critical: '🔴', dead: '💀' }[h.status as string] ?? '❓';
  const beat = h.last_heartbeat ? `Last beat: ${h.last_heartbeat.replace('T', ' ').slice(0, 19)} UTC` : '';
  const checks = Object.entries(h.checks || {}).map(([k, v]) => {
    const icon = v === 'operational' ? '✅' : '🔴';
    return `  ${icon} ${k.replace(/_/g, ' ')}: ${v}`;
  }).join('\n');

  const pm2 = h.pm2 ? `\n*PM2 (from last heartbeat)*: ${h.pm2.online}/${h.pm2.total} online` : '';
  const critDown = h.pm2?.critical_down?.length ? `\n⚠️ Critical down: ${h.pm2.critical_down.join(', ')}` : '';

  return `${statusIcon} *Health* — \`${h.status}\`\n${beat}\nPhase: ${h.phase} | Day ${h.beta?.day_number ?? '?'}\n\n*Infra checks:*\n${checks}${pm2}${critDown}`;
}

export function cmdTier(): string {
  const t = readJSON<any>(path.join(ROOT, 'tier.json'));
  if (!t) return '❌ *Tier* — tier.json not found';

  const hist = (t.history || []).slice(-3).reverse().map((e: any) =>
    `  • ${e.date}: ${e.tier} — ${e.event}`
  ).join('\n');

  return `*Tier Status*\n\nCurrent: \`${t.current_tier}\`\nMRR: $${t.mrr}\nBilling activation: ${t.billing_activation_date}\nDay: ${t.day_number}\n\n*Recent history:*\n${hist || '  none'}`;
}

export function cmdSprint(): string {
  const sprintPath = latestSprintFile();
  if (!sprintPath) return '❌ *Sprint* — no sprint files found';

  const sprint = readJSON<any>(sprintPath);
  if (!sprint) return '❌ *Sprint* — could not parse sprint file';

  const name = path.basename(sprintPath, '.json');
  const tasks: any[] = sprint.tasks || [];
  const done = tasks.filter((t: any) => t.status === 'done').length;
  const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length;
  const pending = tasks.filter((t: any) => !['done', 'in_progress'].includes(t.status)).length;

  // Group by status
  const inProg = tasks.filter((t: any) => t.status === 'in_progress').slice(0, 5)
    .map((t: any) => `  🔄 [${t.id}] ${t.description?.slice(0, 60) ?? t.type}`).join('\n');

  return `*Sprint: ${name}*\n\n✅ Done: ${done}/${tasks.length}\n🔄 In progress: ${inProgress}\n⏳ Pending: ${pending}\n\n${inProg || ''}`;
}

export function cmdReport(): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // 1. PM2 real state
  const procs = getPm2List();
  const online = procs.filter(p => p.status === 'online').length;
  const critDown = procs
    .filter(p => ['backend', 'openclaw-gateway'].includes(p.name) && p.status !== 'online')
    .map(p => p.name);

  const pm2Lines = procs.map(p => {
    const icon = p.status === 'online' ? '🟢' : '🔴';
    const up = fmtUptime(p.uptimeMs);
    const mem = fmtMem(p.memory);
    const r = p.restarts > 100 ? ` ↺${p.restarts}` : '';
    return `${icon} \`${p.name}\` ${up}${mem}${r}`;
  }).join('\n');

  // 2. Health
  const h = readJSON<any>(path.join(ROOT, 'health.json'));
  const healthStatus = h?.status ?? 'unknown';
  const statusIcon = { healthy: '✅', degraded: '⚠️', critical: '🔴', dead: '💀' }[healthStatus] ?? '❓';
  const phase = h?.phase ?? '?';
  const day = h?.beta?.day_number ?? '?';
  const lastBeat = h?.last_heartbeat?.replace('T', ' ').slice(0, 16) ?? 'never';

  // 3. Infra checks
  const downInfra = Object.entries(h?.checks ?? {})
    .filter(([, v]) => v !== 'operational')
    .map(([k]) => k.replace(/_/g, ' '));

  // 4. Tier
  const t = readJSON<any>(path.join(ROOT, 'tier.json'));
  const mrr = t?.mrr ?? 0;
  const tier = t?.current_tier ?? '?';
  const billingDate = t?.billing_activation_date ?? '?';

  // 5. Beta metrics
  const beta = h?.beta ?? {};

  // 6. Sprint
  const sprintPath = latestSprintFile();
  let sprintLine = 'no sprint file';
  if (sprintPath) {
    const s = readJSON<any>(sprintPath);
    if (s) {
      const tasks: any[] = s.tasks || [];
      const done = tasks.filter((t: any) => t.status === 'done').length;
      sprintLine = `${path.basename(sprintPath, '.json')}: ${done}/${tasks.length} done`;
    }
  }

  // 7. Critical alert if any
  const alerts: string[] = [];
  if (critDown.length) alerts.push(`⚠️ CRITICAL DOWN: ${critDown.join(', ')}`);
  if (downInfra.length) alerts.push(`⚠️ Infra issues: ${downInfra.join(', ')}`);
  const alertBlock = alerts.length ? `\n${alerts.join('\n')}\n` : '';

  // 8. Gate countdown
  const manualPostsPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let gatePostCount = 0;
  let gateTotalViews = 0;
  if (fs.existsSync(manualPostsPath)) {
    const lines = fs.readFileSync(manualPostsPath, 'utf-8').split('\n').filter(l => l.trim());
    gatePostCount = lines.length;
    for (const line of lines) {
      try { gateTotalViews += JSON.parse(line).views ?? 0; } catch {}
    }
  }
  const gateDaysLeft = Math.max(0, Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86_400_000));
  const gateIcon = gatePostCount >= 30 && gateTotalViews >= 500 ? '✅' : '⏳';
  const gateLine = `${gateIcon} Phase 1.5 gate: ${gatePostCount}/30 posts · ${gateTotalViews}/500 views · ${gateDaysLeft}d left`;

  return (
    `${statusIcon} *Kognai System Report*\n${now}\n${alertBlock}\n` +
    `*PM2* (${online}/${procs.length} live):\n${pm2Lines || '  (no data)'}\n\n` +
    `*Status:* \`${healthStatus}\` | Phase: ${phase} | Day ${day}\n` +
    `Last heartbeat: ${lastBeat} UTC\n\n` +
    `*Beta:* agents_onboarded=${beta.agents_onboarded ?? 0}, companies=${beta.companies_onboarded ?? 0}, txns=${beta.transactions_monitored ?? 0}\n` +
    `*Financials:* MRR $${mrr} | Tier: ${tier} | Billing activation: ${billingDate}\n\n` +
    `*Gate:* ${gateLine}\n` +
    `*Sprint:* ${sprintLine}`
  );
}

export function cmdCrons(): string {
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const list: any[] = JSON.parse(out);

    const crons = list
      .filter((p: any) => p.pm2_env?.cron_restart)
      .map((p: any) => ({
        name: p.name as string,
        cron: p.pm2_env.cron_restart as string,
        status: (p.pm2_env?.status ?? 'unknown') as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (crons.length === 0) {
      return `⏰ *Cron Schedules* — No cron jobs found in PM2.`;
    }

    // Categorize
    const categories: Record<string, typeof crons> = {};
    for (const c of crons) {
      let cat = 'Other';
      if (c.name.includes('deliver') || c.name.includes('post') || c.name.includes('blitz')) cat = 'Posting';
      else if (c.name.includes('digest') || c.name.includes('brief') || c.name.includes('gate')) cat = 'Digest/Gates';
      else if (c.name.includes('achiri')) cat = 'Achiri';
      else if (c.name.includes('pipeline') || c.name.includes('smoke') || c.name.includes('watchdog')) cat = 'Pipeline';
      else if (c.name.includes('caption') || c.name.includes('schedule') || c.name.includes('view')) cat = 'Content';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(c);
    }

    const lines: string[] = [`⏰ *Cron Schedules* (${crons.length} jobs)\n`];

    for (const [cat, items] of Object.entries(categories)) {
      lines.push(`*${cat}:*`);
      for (const c of items) {
        const icon = c.status === 'online' ? '🟢' : c.status === 'stopped' ? '⏸️' : '🔴';
        lines.push(`${icon} \`${c.cron}\` ${c.name}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Failed to read PM2 cron list: ${e.message}`;
  }
}

export function cmdTikTokAuth(): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;

  if (hasToken) {
    return (
      `✅ *TikTok Access Token is SET!*\n\n` +
      `Auto-posting is ready. The token will be refreshed automatically.\n\n` +
      `To re-authorize: remove TIKTOK\\_ACCESS\\_TOKEN from .env and run /tiktokauth again.`
    );
  }

  if (!clientKey) {
    return (
      `❌ *TIKTOK\\_CLIENT\\_KEY not set*\n\n` +
      `Add it to .env first:\n` +
      `1. Go to developers.tiktok.com\n` +
      `2. Create an app → get Client Key + Client Secret\n` +
      `3. Add to .env:\n` +
      `   TIKTOK\\_CLIENT\\_KEY=your\\_key\n` +
      `   TIKTOK\\_CLIENT\\_SECRET=your\\_secret`
    );
  }

  const port = process.env.TIKTOK_OAUTH_PORT || '3456';
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${port}/callback`;
  const scopes = 'user.info.basic,video.publish';

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: scopes,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: require('crypto').randomBytes(8).toString('hex'),
  });
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  return (
    `🔑 *TikTok Authorization*\n\n` +
    `*Step 1:* Start the callback server on your Mac:\n` +
    `\`npx ts-node scripts/tiktok-oauth.ts\`\n\n` +
    `*Step 2:* Open this URL in your browser:\n` +
    `${authUrl}\n\n` +
    `*Step 3:* Authorize the app on TikTok\n\n` +
    `*Step 4:* The callback server will save the token to .env automatically\n\n` +
    `*Step 5:* Restart the bot: \`pm2 restart kognai-telegram-bot\`\n\n` +
    `After this, auto-posting will be enabled!`
  );
}

export function cmdQuickStart(): string {
  const expPath = path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  const topicsPath = path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
  const scsDir = path.join(ROOT, 'workspace', 'scs001');

  // Load posted IDs
  const postedIds = new Set<string>();
  if (fs.existsSync(mpPath)) {
    for (const l of fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
    }
  }

  // Load experiment scores
  const scores = new Map<string, number>();
  const expData = new Map<string, { speaker: string; hook: string }>();
  if (fs.existsSync(expPath)) {
    for (const l of fs.readFileSync(expPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        const id = e.clip_id ?? e.video_id;
        if (id) {
          scores.set(id, e.partial_viral_score ?? 0);
          expData.set(id, { speaker: e.speaker ?? 'unknown', hook: e.hook_formula ?? '' });
        }
      } catch {}
    }
  }

  // Find best unposted video with captioned mp4
  const candidates: Array<{ id: string; score: number; mp4: string }> = [];
  if (fs.existsSync(ledgerPath)) {
    const runDirs = fs.existsSync(scsDir)
      ? fs.readdirSync(scsDir).filter((d: string) => d.startsWith('run-'))
      : [];
    for (const l of fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l: string) => l.trim())) {
      try {
        const e = JSON.parse(l);
        if (!e.video_id || postedIds.has(e.video_id)) continue;
        for (const dir of runDirs) {
          const mp4 = path.join(scsDir, dir, 'caption', `${e.video_id}-captioned.mp4`);
          if (fs.existsSync(mp4)) {
            candidates.push({ id: e.video_id, score: scores.get(e.video_id) ?? 0, mp4 });
            break;
          }
        }
      } catch {}
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return '❌ No captioned videos found. Run /refresh to generate content first.';
  }

  const best = candidates[0];
  const exp = expData.get(best.id);

  // Build caption
  let hashtags = ['#fyp', '#viral', '#learnontiktok', '#ai', '#tech'];
  if (fs.existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
      const topicTags = (vt.topics ?? []).slice(0, 4).map((t: string) => '#' + t.replace(/\s+/g, ''));
      hashtags = [...topicTags, ...hashtags].slice(0, 8);
    } catch {}
  }
  const captionLines: string[] = [];
  if (exp?.speaker && exp.speaker !== 'unknown') captionLines.push(exp.speaker);
  if (exp?.hook) captionLines.push(exp.hook);
  captionLines.push('');
  captionLines.push(hashtags.join(' '));
  const caption = captionLines.join('\n');

  const lines: string[] = [
    '🚀 *Quick Start — Post Your First Video*',
    '',
    `🎬 Best video: \`${best.id}\``,
    `📊 Viral score: *${Math.round(best.score * 100)}%*`,
    exp?.speaker ? `🎙️ ${exp.speaker}` : '',
    '',
    '*Step 1:* Find the video file:',
    `\`${best.mp4}\``,
    '',
    '*Step 2:* Copy this caption for TikTok:',
  ].filter(Boolean);

  // Add caption as code block
  lines.push('```');
  lines.push(caption);
  lines.push('```');

  lines.push('');
  lines.push('*Step 3:* Upload to TikTok:');
  lines.push('  1. Open TikTok app → tap +');
  lines.push('  2. Upload the video file');
  lines.push('  3. Paste the caption');
  lines.push('  4. Post!');
  lines.push('');
  lines.push('*Step 4:* After posting, run:');
  lines.push(`\`/record ${best.id} 0\``);
  lines.push('');
  lines.push(`_${candidates.length} more videos ready after this one!_`);

  return lines.join('\n');
}

// Sprint 463: /gitstats — repository statistics
export function cmdGitStats(): string {
  const lines: string[] = ['*📊 Git Repository Stats*', ''];

  try {
    const commitCount = execSync('git rev-list --count HEAD', { cwd: ROOT, timeout: 5000, stdio: 'pipe' }).toString().trim();
    const sprintCount = execSync('git log --oneline | grep -c "Sprint [0-9]"', { cwd: ROOT, timeout: 5000, stdio: 'pipe' }).toString().trim();
    const tags = execSync('git tag -l --sort=-creatordate', { cwd: ROOT, timeout: 5000, stdio: 'pipe' }).toString().trim();
    const lastCommits = execSync('git log --oneline -5', { cwd: ROOT, timeout: 5000, stdio: 'pipe' }).toString().trim();
    const firstCommit = execSync('git log --reverse --format="%ai" | head -1', { cwd: ROOT, timeout: 5000, stdio: 'pipe' }).toString().trim().slice(0, 10);
    const branch = execSync('git branch --show-current', { cwd: ROOT, timeout: 5000, stdio: 'pipe' }).toString().trim();

    lines.push(`*Branch:* \`${branch}\``);
    lines.push(`*Commits:* ${commitCount}`);
    lines.push(`*Sprints shipped:* ${sprintCount}`);
    lines.push(`*Since:* ${firstCommit}`);
    lines.push('');

    if (tags) {
      lines.push('*Tags:*');
      for (const tag of tags.split('\n').slice(0, 5)) {
        lines.push(`  🏷 \`${tag}\``);
      }
      lines.push('');
    }

    lines.push('*Last 5 commits:*');
    for (const line of lastCommits.split('\n')) {
      lines.push(`  ${line}`);
    }
  } catch (e: any) {
    lines.push(`❌ Error: ${e.message}`);
  }

  return lines.join('\n');
}

// Sprint 456: /envcheck — environment variable audit
export function cmdEnvCheck(): string {
  const { formatEnvCheck } = require('../check-env');
  return formatEnvCheck();
}

// Sprint 461: /stripestatus — Stripe integration status (async)
export async function cmdStripeStatus(): Promise<string> {
  const { runStripeChecks, formatStripeStatus } = require('../test-stripe');
  const results = await runStripeChecks();
  return formatStripeStatus(results);
}

// Sprint 462: /readiness — unified go-live dashboard
export function cmdReadiness(): string {
  const lines: string[] = ['🚀 *Go-Live Readiness Dashboard*', ''];

  let totalChecks = 0;
  let passedChecks = 0;

  // 1. Gate Progress
  const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let postCount = 0;
  let totalViews = 0;
  if (fs.existsSync(mpPath)) {
    const posts = fs.readFileSync(mpPath, 'utf-8').split('\n').filter((l: string) => l.trim());
    postCount = posts.length;
    for (const l of posts) {
      try { totalViews += JSON.parse(l).views ?? 0; } catch {}
    }
  }
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));
  const postsOk = postCount >= 30;
  const viewsOk = totalViews >= 500;

  lines.push('*📊 Phase 1.5 Gate (Apr 7)*');
  lines.push(`  ${postsOk ? '✅' : '❌'} Posts: ${postCount}/30${!postsOk ? ` (${30 - postCount} more needed)` : ''}`);
  lines.push(`  ${viewsOk ? '✅' : '❌'} Views: ${totalViews}/500${!viewsOk ? ` (${500 - totalViews} more needed)` : ''}`);
  lines.push(`  ⏱ ${daysLeft} days remaining`);
  totalChecks += 2;
  passedChecks += (postsOk ? 1 : 0) + (viewsOk ? 1 : 0);

  // 2. Key Environment Variables
  lines.push('');
  lines.push('*🔧 Environment*');
  const envChecks: Array<[string, string]> = [
    ['TIKTOK_ACCESS_TOKEN', 'TikTok API'],
    ['STRIPE_SECRET_KEY', 'Stripe'],
    ['ANTHROPIC_API_KEY', 'Claude API'],
    ['TELEGRAM_BOT_TOKEN', 'Telegram Bot'],
    ['SUPABASE_URL', 'Supabase'],
  ];
  // Also check alternate telegram token name
  const tgToken = process.env.CEO_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  for (const [envVar, label] of envChecks) {
    let isSet = !!process.env[envVar];
    if (envVar === 'TELEGRAM_BOT_TOKEN') isSet = !!tgToken;
    lines.push(`  ${isSet ? '✅' : '❌'} ${label}`);
    totalChecks++;
    if (isSet) passedChecks++;
  }

  // 3. Pipeline Health
  lines.push('');
  lines.push('*📦 Pipeline*');
  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const readyCount = ledger.filter((e: any) => findCaptionedMp4(e.video_id) !== null).length;
  const pipelineOk = readyCount >= 5;
  lines.push(`  ${pipelineOk ? '✅' : '❌'} Captioned videos: ${readyCount} ready`);
  lines.push(`  📋 Ledger: ${ledger.length} total entries`);
  totalChecks++;
  if (pipelineOk) passedChecks++;

  // 4. Pipeline runner status
  const latestRunPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
  let lastRunAge = Infinity;
  if (fs.existsSync(latestRunPath)) {
    try {
      const run = JSON.parse(fs.readFileSync(latestRunPath, 'utf-8'));
      if (run.completed_at) {
        lastRunAge = Math.round((Date.now() - new Date(run.completed_at).getTime()) / 3600000);
      }
    } catch {}
  }
  const pipelineFresh = lastRunAge < 24;
  lines.push(`  ${pipelineFresh ? '✅' : '⚠️'} Last run: ${lastRunAge < Infinity ? `${lastRunAge}h ago` : 'never'}`);
  totalChecks++;
  if (pipelineFresh) passedChecks++;

  // 5. Stripe
  lines.push('');
  lines.push('*💳 Stripe*');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const isLive = stripeKey?.startsWith('sk_live_');
  const stripeOk = !!stripeKey;
  lines.push(`  ${stripeOk ? '✅' : '❌'} API: ${isLive ? '🟢 LIVE' : stripeOk ? '🟡 TEST' : '❌ NOT SET'}`);
  const webhookOk = !!process.env.STRIPE_WEBHOOK_SECRET;
  lines.push(`  ${webhookOk ? '✅' : '❌'} Webhook: ${webhookOk ? 'configured' : 'missing'}`);
  totalChecks += 2;
  passedChecks += (stripeOk ? 1 : 0) + (webhookOk ? 1 : 0);

  // 6. TTS
  lines.push('');
  lines.push('*🔊 TTS*');
  const hasSay = (() => { try { require('child_process').execSync('which say', { stdio: 'pipe' }); return true; } catch { return false; } })();
  const hasElevenlabs = !!process.env.ELEVENLABS_API_KEY;
  lines.push(`  ${hasSay ? '✅' : '❌'} Local TTS (macOS say)`);
  lines.push(`  ${hasElevenlabs ? '✅' : '⚪'} ElevenLabs API${hasElevenlabs ? '' : ' (optional)'}`);
  totalChecks++;
  if (hasSay || hasElevenlabs) passedChecks++;

  // Overall readiness
  const pct = Math.round((passedChecks / totalChecks) * 100);
  const emoji = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴';
  lines.push('');
  lines.push(`${emoji} *Overall: ${pct}% ready* (${passedChecks}/${totalChecks} checks)`);

  // Blockers
  const blockers: string[] = [];
  if (!postsOk) blockers.push(`Post ${30 - postCount} videos to TikTok`);
  if (!process.env.TIKTOK_ACCESS_TOKEN) blockers.push('Set TIKTOK_ACCESS_TOKEN');
  if (!isLive && stripeOk) blockers.push('Switch Stripe to LIVE mode');
  if (!stripeOk) blockers.push('Set STRIPE_SECRET_KEY');

  if (blockers.length > 0) {
    lines.push('');
    lines.push('*🔴 Blockers:*');
    for (const b of blockers) lines.push(`  • ${b}`);
  }

  return lines.join('\n');
}

// Sprint 496: Extracted from telegram-bot.ts

export async function cmdBoot(chatId: string): Promise<void> {
  const ESSENTIAL_CRONS = [
    'kognai-daily-digest',
    'kognai-gate-regen',
    'kognai-gate-tracker-update',
    'kognai-brief-regen',
    'kognai-post-noon',
    'kognai-post-evening',
    'kognai-pipeline-watchdog',
    'kognai-smoke-test',
    'kognai-calendar-regen',
    'kognai-schedule-regen',
    'kognai-leaderboard-regen',
    'kognai-auto-deliver-morning',
    'kognai-auto-deliver-noon',
    'kognai-auto-deliver-evening',
    'kognai-view-tracker',
    'kognai-watchdog',
    'kognai-caption-push',
    'scs001-pipeline',
  ];

  await sendMessage(chatId, `🔄 *Booting ${ESSENTIAL_CRONS.length} essential crons...*`);

  const started: string[] = [];
  const failed: string[] = [];
  const alreadyOnline: string[] = [];

  const procs = getPm2List();
  const onlineNames = new Set(procs.filter(p => p.status === 'online').map(p => p.name));

  for (const name of ESSENTIAL_CRONS) {
    if (onlineNames.has(name)) {
      alreadyOnline.push(name);
      continue;
    }
    try {
      execSync(`pm2 start ecosystem.config.js --only ${name}`, { cwd: ROOT, timeout: 15000, stdio: 'pipe' });
      started.push(name);
    } catch {
      failed.push(name);
    }
  }

  const lines = [
    '🚀 *Boot Complete*',
    '',
  ];

  if (started.length > 0) {
    lines.push(`✅ *Started (${started.length}):*`);
    for (const n of started) lines.push(`  🟢 ${n}`);
    lines.push('');
  }
  if (alreadyOnline.length > 0) {
    lines.push(`⏩ *Already running (${alreadyOnline.length}):*`);
    for (const n of alreadyOnline) lines.push(`  🟢 ${n}`);
    lines.push('');
  }
  if (failed.length > 0) {
    lines.push(`❌ *Failed (${failed.length}):*`);
    for (const n of failed) lines.push(`  🔴 ${n}`);
    lines.push('');
  }

  const totalOnline = started.length + alreadyOnline.length;
  lines.push(`📊 ${totalOnline}/${ESSENTIAL_CRONS.length} crons active`);
  if (failed.length > 0) {
    lines.push(`\n_Check logs: \`pm2 logs <name> --lines 20\`_`);
  }

  await sendMessage(chatId, lines.join('\n'));
}

export async function cmdShutdown(chatId: string): Promise<void> {
  const STOPPABLE_CRONS = [
    'kognai-daily-digest',
    'kognai-gate-regen',
    'kognai-gate-tracker-update',
    'kognai-brief-regen',
    'kognai-post-noon',
    'kognai-post-evening',
    'kognai-pipeline-watchdog',
    'kognai-smoke-test',
    'kognai-calendar-regen',
    'kognai-schedule-regen',
    'kognai-leaderboard-regen',
    'kognai-auto-deliver-morning',
    'kognai-auto-deliver-noon',
    'kognai-auto-deliver-evening',
    'kognai-view-tracker',
    'kognai-watchdog',
    'kognai-caption-push',
    'kognai-auto-healer',
    'scs001-pipeline',
  ];

  await sendMessage(chatId, `🛑 *Stopping ${STOPPABLE_CRONS.length} crons...*\n\n_telegram-bot and stripe-webhook will keep running._`);

  let stopped = 0;
  let alreadyStopped = 0;

  const procs = getPm2List();
  const onlineNames = new Set(procs.filter(p => p.status === 'online').map(p => p.name));

  for (const name of STOPPABLE_CRONS) {
    if (!onlineNames.has(name)) {
      alreadyStopped++;
      continue;
    }
    try {
      execSync(`pm2 stop ${name}`, { timeout: 10000, stdio: 'pipe' });
      stopped++;
    } catch { /* ignore */ }
  }

  await sendMessage(chatId, [
    '🛑 *Shutdown Complete*',
    '',
    `⏹ Stopped: *${stopped}* crons`,
    `⏩ Already stopped: *${alreadyStopped}*`,
    '',
    `🟢 Still running: telegram-bot, stripe-webhook`,
    '',
    `_Type \`/boot\` to restart everything._`,
  ].join('\n'));
}

export async function cmdReload(chatId: string): Promise<void> {
  await sendMessage(chatId, '🔄 *Reloading bot...*\n\nRestarting in 2 seconds. Bot will be back shortly.');
  setTimeout(() => {
    try {
      execSync('pm2 restart telegram-bot', { timeout: 10000, stdio: 'pipe' });
    } catch {
      process.exit(0);
    }
  }, 2000);
}

// Sprint 482: Swarm metrics summary
export function cmdSwarmStats(): string {
  const SWARM_DIR = path.join(ROOT, 'reports', 'swarm-runs');
  try {
    const files = fs.readdirSync(SWARM_DIR).filter(f => f.endsWith('.json')).sort();
    if (files.length === 0) return '📊 No swarm runs found.';

    let totalTasks = 0, totalDone = 0, totalRejected = 0, totalTokens = 0, totalDuration = 0;
    const modelCalls: Record<string, number> = {};

    for (const file of files) {
      try {
        const run = JSON.parse(fs.readFileSync(path.join(SWARM_DIR, file), 'utf8'));
        const s = run.summary || {};
        totalTasks += s.total_tasks || 0;
        totalDone += s.done || 0;
        totalRejected += s.rejected || 0;
        totalTokens += s.total_tokens || 0;
        totalDuration += run.duration_seconds || 0;
        for (const [model, stats] of Object.entries(run.models_used || {})) {
          modelCalls[model] = (modelCalls[model] || 0) + ((stats as any).calls || 0);
        }
      } catch { /* skip corrupt files */ }
    }

    const passRate = totalTasks > 0 ? (totalDone / totalTasks * 100).toFixed(1) : '0';
    const avgDuration = files.length > 0 ? Math.round(totalDuration / files.length) : 0;
    const avgTokens = files.length > 0 ? Math.round(totalTokens / files.length) : 0;

    const modelLines = Object.entries(modelCalls)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([m, c]) => `  ${m}: ${c} calls`)
      .join('\n');

    return [
      '🤖 *Swarm Metrics*\n',
      `📦 Total runs: ${files.length}`,
      `✅ Tasks done: ${totalDone}/${totalTasks} (${passRate}% pass)`,
      `❌ Rejected: ${totalRejected}`,
      `⏱ Avg duration: ${Math.round(avgDuration / 60)}min`,
      `🔤 Avg tokens/run: ${avgTokens.toLocaleString()}`,
      `🔤 Total tokens: ${totalTokens.toLocaleString()}`,
      '',
      '📊 Model usage:',
      modelLines,
    ].join('\n');
  } catch (err: any) {
    return `❌ Swarm stats error: ${err.message}`;
  }
}

// Sprint 550: cmdCleanup moved to cmd-management.ts (Sprint 630 dedup)

// Sprint 589: /errors — show recent pipeline validation errors
export function cmdErrors(): string {
  const errPath = path.join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl');
  if (!fs.existsSync(errPath)) return '✅ *No validation errors file found* — pipeline is clean.';

  const lines = readLines(errPath);
  if (lines.length === 0) return '✅ *No validation errors* — pipeline is clean.';

  const recent = lines.slice(-10).reverse();
  const formatted = recent.map((e: any, i: number) => {
    const ts = e.timestamp ? new Date(e.timestamp).toLocaleString('en-GB', { timeZone: 'UTC' }) : 'unknown';
    const type = e.type || 'unknown';
    const stage = e.stage || '';
    const err = e.error || e.message || 'no details';
    return `${i + 1}. *${type}*${stage ? ` (${stage})` : ''}\n   ${err}\n   _${ts}_`;
  });

  return [
    `⚠️ *Pipeline Errors* — last ${recent.length} of ${lines.length} total`,
    '',
    ...formatted,
  ].join('\n');
}

// Sprint 593: /tokencheck — validate TikTok access token health
export function cmdTokenCheck(): string {
  try {
    const output = execSync(
      'npx ts-node --transpile-only scripts/tiktok-token-validator.ts',
      { cwd: ROOT, timeout: 15000, encoding: 'utf-8' }
    );
    // Extract the formatted report (everything before "Report:" line)
    const lines = output.split('\n');
    const reportIdx = lines.findIndex(l => l.startsWith('Report:'));
    return (reportIdx > 0 ? lines.slice(0, reportIdx) : lines).join('\n').trim();
  } catch (e: any) {
    const stderr = e.stderr?.toString() ?? '';
    const stdout = e.stdout?.toString() ?? '';
    // The script prints the report to stdout even on non-zero exit
    if (stdout.includes('Token Status')) return stdout.trim();
    return `❌ Token check failed: ${(stderr || e.message || '').slice(0, 200)}`;
  }
}

// Sprint 595: /logs — tail recent error logs from key processes
export function cmdLogs(): string {
  const logDir = path.join(ROOT, 'logs');
  const logFiles: Array<{ name: string; file: string }> = [
    { name: 'Pipeline', file: 'scs001-pipeline-error.log' },
    { name: 'Digest', file: 'daily-digest-error.log' },
    { name: 'Bot', file: 'telegram-bot-error.log' },
    { name: 'Gate Regen', file: 'gate-regen-error.log' },
    { name: 'Token Refresh', file: 'token-refresh-error.log' },
    { name: 'Watchdog', file: 'watchdog-error.log' },
  ];

  const sections: string[] = ['📋 *Recent Error Logs*', ''];
  let totalErrors = 0;

  for (const log of logFiles) {
    const filePath = path.join(logDir, log.file);
    if (!fs.existsSync(filePath)) {
      sections.push(`*${log.name}:* no log file`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) {
      sections.push(`*${log.name}:* ✅ empty (no errors)`);
      continue;
    }

    const lines = content.split('\n').filter(l => l.trim());
    const recent = lines.slice(-3); // Last 3 entries
    totalErrors += lines.length;

    sections.push(`*${log.name}:* ${lines.length} entries`);
    for (const line of recent) {
      // Truncate and escape for Telegram
      const clean = line.replace(/[<>]/g, '').slice(0, 120);
      sections.push(`  \`${clean}\``);
    }
    sections.push('');
  }

  sections.push(`_Total: ${totalErrors} errors across ${logFiles.length} logs_`);
  return sections.join('\n');
}

// Sprint 629: /preflight — Production readiness check
export function cmdPreflight(): string {
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Env var checks
  const envChecks = [
    { key: 'TIKTOK_ACCESS_TOKEN', label: 'TikTok Token', required: true },
    { key: 'SUPABASE_URL', label: 'Supabase URL', required: true },
    { key: 'SUPABASE_SERVICE_KEY', label: 'Supabase Key', required: true },
    { key: 'SCS_EDITING_MODE', label: 'Editing Mode', required: false },
    { key: 'STRIPE_SECRET_KEY', label: 'Stripe Key', required: false },
    { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot', required: true },
  ];
  for (const e of envChecks) {
    const val = process.env[e.key];
    checks.push({
      name: `${e.label}${e.required ? '' : ' (opt)'}`,
      pass: Boolean(val),
      detail: val ? '✅' : '❌ not set',
    });
  }

  // Video queue
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const postedPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let queueCount = 0;
  let postCount = 0;
  try {
    if (fs.existsSync(ledgerPath)) {
      const posted = new Set<string>();
      if (fs.existsSync(postedPath)) {
        for (const l of fs.readFileSync(postedPath, 'utf-8').split('\n').filter(l => l.trim())) {
          try { posted.add(JSON.parse(l).video_id); } catch {}
        }
      }
      postCount = posted.size;
      const ledger = fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
      for (const l of ledger) {
        try { const e = JSON.parse(l); if (e.video_id && !posted.has(e.video_id)) queueCount++; } catch {}
      }
    }
  } catch {}
  checks.push({ name: 'Video Queue', pass: queueCount > 0, detail: queueCount > 0 ? `${queueCount} ready` : '❌ empty' });
  checks.push({ name: 'Posts Recorded', pass: postCount > 0, detail: `${postCount}/30` });

  // PM2
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000, encoding: 'utf-8' });
    const procs = JSON.parse(pm2Out);
    const online = procs.filter((p: any) => p.pm2_env?.status === 'online').length;
    checks.push({ name: 'PM2 Processes', pass: online > 0, detail: `${online} online` });
  } catch {
    checks.push({ name: 'PM2 Processes', pass: false, detail: '❌ pm2 not running' });
  }

  // Build output
  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const allPass = passed === total;

  const lines: string[] = [
    `🔧 *Preflight Check* — ${allPass ? '✅ READY' : `⚠️ ${total - passed} issue(s)`}`,
    `${passed}/${total} checks passed`,
    '',
  ];
  for (const c of checks) {
    lines.push(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  if (!allPass) {
    lines.push('', '*Fix:* Set missing env vars in `.env`, run `/refresh` to fill queue');
  }

  return lines.join('\n');
}

// Sprint 619: /changelog — Recent sprints from git log
export function cmdChangelog(count: number = 10): string {
  try {
    const raw = execSync(`git log --oneline -${count * 2} 2>/dev/null`, {
      cwd: ROOT, timeout: 5000, encoding: 'utf-8',
    });
    const sprintLines = raw.split('\n')
      .filter(l => l.includes('Sprint ') && !l.includes('state:'))
      .slice(0, count);

    if (sprintLines.length === 0) return '📋 No recent sprints found in git log.';

    const lines: string[] = ['📋 *Recent Sprints*', ''];
    for (const line of sprintLines) {
      const match = line.match(/^([a-f0-9]+)\s+Sprint (\d+):\s*(.+)/);
      if (match) {
        lines.push(`*#${match[2]}* — ${match[3].slice(0, 60)}`);
      } else {
        lines.push(`  ${line.slice(0, 70)}`);
      }
    }
    lines.push('');
    lines.push(`_Showing ${sprintLines.length} sprints_`);
    return lines.join('\n');
  } catch {
    return '❌ Could not read git log.';
  }
}
