/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, readRealPosts, getPm2List, fmtUptime, fmtMem, latestSprintFile,
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

  // Sprint 1076: stale heartbeat warning
  let beatStaleWarning = '';
  let beat = h.last_heartbeat ? `Last beat: ${h.last_heartbeat.replace('T', ' ').slice(0, 19)} UTC` : '';
  if (h.last_heartbeat) {
    const beatAgeMin = (Date.now() - new Date(h.last_heartbeat).getTime()) / 60000;
    if (beatAgeMin > 10) {
      beatStaleWarning = `\n⚠️ *Stale heartbeat: ${Math.round(beatAgeMin)}m ago* — health monitor may be down`;
    }
    beat += ` (${beatAgeMin < 60 ? `${Math.round(beatAgeMin)}m ago` : `${Math.floor(beatAgeMin / 60)}h ago`})`;
  }

  const checks = Object.entries(h.checks || {}).map(([k, v]) => {
    const icon = v === 'operational' ? '✅' : '🔴';
    return `  ${icon} ${k.replace(/_/g, ' ')}: ${v}`;
  }).join('\n');

  const pm2 = h.pm2 ? `\n*PM2 (from last heartbeat)*: ${h.pm2.online}/${h.pm2.total} online` : '';
  const critDown = h.pm2?.critical_down?.length ? `\n⚠️ Critical down: ${h.pm2.critical_down.join(', ')}` : '';

  // Sprint 1066: Ollama model availability check
  const OLLAMA_MODELS = ['qwen3:0.6b', 'qwen3:4b', 'deepseek-r1:14b'];
  let ollamaSection = '';
  try {
    const raw = execSync('curl -sf --max-time 3 http://localhost:11434/api/tags', { encoding: 'utf-8' });
    const tags = JSON.parse(raw);
    const loaded: string[] = (tags.models ?? []).map((m: any) => m.name as string);
    const modelLines = OLLAMA_MODELS.map(m => {
      const present = loaded.some(l => l.startsWith(m.split(':')[0]) && l.includes(m.split(':')[1]));
      return `  ${present ? '✅' : '❌'} ${m}`;
    });
    const extra = loaded.filter(l => !OLLAMA_MODELS.some(m => l.startsWith(m.split(':')[0]))).length;
    const extraNote = extra > 0 ? ` (+${extra} other)` : '';
    ollamaSection = `\n\n*Ollama models:*\n${modelLines.join('\n')}${extraNote ? `\n  _${extraNote}_` : ''}`;
  } catch {
    ollamaSection = '\n\n*Ollama:* ❌ unreachable (localhost:11434)';
  }

  // Sprint 1085 + 1096: PM2 memory warning (>500MB) + restart warning (>100)
  const MEM_WARN_MB = 500;
  const RESTART_WARN = 100;
  let memWarnSection = '';
  try {
    const procs = getPm2List();
    const highMem = procs.filter(p => p.memory > MEM_WARN_MB * 1024 * 1024);
    const highRestarts = procs.filter(p => p.restarts > RESTART_WARN);
    const warnLines: string[] = [];
    if (highMem.length > 0) {
      warnLines.push(`⚠️ *High memory (>${MEM_WARN_MB}MB):*`);
      for (const p of highMem) warnLines.push(`  ⚠️ \`${p.name}\` — ${fmtMem(p.memory)}`);
    }
    if (highRestarts.length > 0) {
      warnLines.push(`⚠️ *Excessive restarts (>${RESTART_WARN}):*`);
      for (const p of highRestarts) warnLines.push(`  🔁 \`${p.name}\` — ${p.restarts} restarts`);
    }
    if (warnLines.length > 0) memWarnSection = '\n\n' + warnLines.join('\n');
  } catch { /* skip */ }

  // Sprint 1106: Supabase connection status
  let supabaseSection = '';
  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_ANON_KEY;
    if (sbUrl && sbKey) {
      const out = execSync(
        `curl -sf --max-time 5 -H "apikey: ${sbKey}" -H "Authorization: Bearer ${sbKey}" "${sbUrl}/rest/v1/" -o /dev/null -w "%{http_code}"`,
        { encoding: 'utf-8', timeout: 8000 }
      ).trim();
      const code = parseInt(out);
      supabaseSection = code >= 200 && code < 400
        ? '\n\n*Supabase:* ✅ connected'
        : `\n\n*Supabase:* ⚠️ HTTP ${code}`;
    } else {
      supabaseSection = '\n\n*Supabase:* ⚠️ URL/key not set';
    }
  } catch {
    supabaseSection = '\n\n*Supabase:* ❌ unreachable';
  }

  return `${statusIcon} *Health* — \`${h.status}\`\n${beat}${beatStaleWarning}\nPhase: ${h.phase} | Day ${h.beta?.day_number ?? '?'}\n\n*Infra checks:*\n${checks}${pm2}${critDown}${ollamaSection}${memWarnSection}${supabaseSection}`;
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

  // 8. Gate countdown (excludes dry-run posts)
  const realPosts = readRealPosts();
  const gatePostCount = realPosts.length;
  const gateTotalViews = realPosts.reduce((sum: number, p: any) => sum + (p.views ?? 0), 0);
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

// Sprint 1100: compute next cron fire time (simple 5-field cron, no DST)
function nextCronFire(expr: string): string {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return '';
    const [minP, hourP] = parts;
    const now = new Date();
    const candidate = new Date(now);
    // Advance by 1 minute to avoid matching "now"
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const parseField = (f: string, min: number, max: number): number[] => {
      if (f === '*') return Array.from({ length: max - min + 1 }, (_, i) => i + min);
      if (f.startsWith('*/')) { const s = parseInt(f.slice(2)); return Array.from({ length: max - min + 1 }, (_, i) => i + min).filter(v => (v - min) % s === 0); }
      return f.split(',').flatMap(p => {
        if (p.includes('-')) { const [a, b] = p.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => i + a); }
        return [parseInt(p)];
      }).filter(v => v >= min && v <= max);
    };

    const minutes = parseField(minP, 0, 59);
    const hours = parseField(hourP, 0, 23);
    for (let d = 0; d < 2; d++) {
      for (const h of hours) {
        for (const m of minutes) {
          const t = new Date(candidate);
          t.setDate(candidate.getDate() + d);
          t.setHours(h, m, 0, 0);
          if (t >= candidate) {
            const diffMin = Math.round((t.getTime() - now.getTime()) / 60000);
            if (diffMin < 60) return `${diffMin}m`;
            return `${Math.round(diffMin / 60)}h ${diffMin % 60}m`;
          }
        }
      }
    }
    return '';
  } catch { return ''; }
}

export function cmdCrons(): string {
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const list: any[] = JSON.parse(out);

    const crons = list
      .filter((p: any) => p.pm2_env?.cron_restart)
      .map((p: any) => {
        // Sprint 1072: track last restart for staleness detection
        const restartTime = p.pm2_env?.pm_uptime ?? p.pm2_env?.restart_time ?? 0;
        const ageHours = restartTime > 0 ? (Date.now() - restartTime) / 3600000 : -1;
        return {
          name: p.name as string,
          cron: p.pm2_env.cron_restart as string,
          status: (p.pm2_env?.status ?? 'unknown') as string,
          ageHours,
          stale: ageHours > 25,
        };
      })
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

    const staleCount = crons.filter(c => c.stale).length;
    const lines: string[] = [`⏰ *Cron Schedules* (${crons.length} jobs${staleCount > 0 ? ` · ⚠️ ${staleCount} stale` : ''})\n`];

    for (const [cat, items] of Object.entries(categories)) {
      lines.push(`*${cat}:*`);
      for (const c of items) {
        const icon = c.status === 'online' ? (c.stale ? '⚠️' : '🟢') : c.status === 'stopped' ? '⏸️' : '🔴';
        const age = c.ageHours >= 0 ? ` (last: ${Math.round(c.ageHours)}h ago)` : '';
        const staleTag = c.stale ? ' *STALE*' : '';
        // Sprint 1100: next fire time
        const nextFire = nextCronFire(c.cron);
        const nextStr = nextFire ? ` · next: ${nextFire}` : '';
        lines.push(`${icon} \`${c.cron}\` ${c.name}${age}${nextStr}${staleTag}`);
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
// Sprint 1054: /errors — scan all PM2 error logs for recent activity (last 24h)
export function cmdErrors(): string {
  const logDir = path.join(ROOT, 'logs');
  const cutoff = Date.now() - 86_400_000; // 24h ago

  // Sprint 1080 + 1091: Deduplicate repeated error lines — show "×N" + time window
  interface DedupError { name: string; line: string; count: number; mtime: number; firstMtime: number; }
  const dedupMap = new Map<string, DedupError>();

  try {
    const logFiles = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
    for (const file of logFiles) {
      const fullPath = path.join(logDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size === 0 || stat.mtimeMs < cutoff) continue;
        const content = fs.readFileSync(fullPath, 'utf-8').trim();
        if (!content) continue;
        const lines = content.split('\n').filter((l: string) => l.trim());
        if (lines.length === 0) continue;
        const processName = file.replace(/-error\.log$/, '');
        for (const raw of lines) {
          const lower = raw.toLowerCase();
          if (!(lower.includes('error') || lower.includes('fatal') ||
                lower.includes('exception') || lower.includes('fail'))) continue;
          const trimmed = raw.slice(0, 120);
          const key = `${processName}::${trimmed}`;
          const existing = dedupMap.get(key);
          if (existing) {
            existing.count++;
            existing.mtime = Math.max(existing.mtime, stat.mtimeMs);
            existing.firstMtime = Math.min(existing.firstMtime, stat.mtimeMs);
          } else {
            dedupMap.set(key, { name: processName, line: trimmed, count: 1, mtime: stat.mtimeMs, firstMtime: stat.mtimeMs });
          }
        }
      } catch { /* skip unreadable */ }
    }
  } catch {
    return '❌ Could not read logs directory.';
  }

  const errored = Array.from(dedupMap.values()).sort((a, b) => b.mtime - a.mtime);
  const output: string[] = [];
  const MAX_ENTRIES = 8;

  if (errored.length === 0) {
    output.push('✅ *No PM2 process errors* in the last 24h — all clean.');
  } else {
    // Sprint 1091: show time window (earliest to latest error)
    const allMtimes = errored.map(e => e.firstMtime).concat(errored.map(e => e.mtime));
    const windowStart = Math.min(...allMtimes);
    const windowEnd = Math.max(...allMtimes);
    const fmtTime = (ms: number) => { const ago = Math.round((Date.now() - ms) / 60_000); return ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`; };
    const windowStr = windowStart === windowEnd ? fmtTime(windowStart) : `${fmtTime(windowStart)} → ${fmtTime(windowEnd)}`;
    output.push(`⚠️ *PM2 Errors (last 24h)* — ${errored.length} unique · _${windowStr}_\n`);
    for (const e of errored.slice(0, MAX_ENTRIES)) {
      const ago = Math.round((Date.now() - e.mtime) / 60_000);
      const timeStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
      const countStr = e.count > 1 ? ` ×${e.count}` : '';
      output.push(`*${e.name}* _(${timeStr}${countStr})_\n  \`${e.line}\``);
    }
    if (errored.length > MAX_ENTRIES) output.push(`\n_…and ${errored.length - MAX_ENTRIES} more. Check logs/ directly._`);
  }

  // Append pipeline validation errors if any
  const errPath = path.join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl');
  if (fs.existsSync(errPath)) {
    try {
      const valLines = fs.readFileSync(errPath, 'utf-8').trim().split('\n').filter(Boolean)
        .map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (valLines.length > 0) {
        // Sprint 1080: deduplicate repeated error lines — show count instead
        const counts = new Map<string, number>();
        for (const e of valLines) {
          const raw = ((e as any).error ?? (e as any).message ?? 'unknown') as string;
          const key = raw.slice(0, 100);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const dedupedErrors = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        output.push(`\n*Pipeline validation errors (${valLines.length} total, ${counts.size} unique):*`);
        for (const [msg, count] of dedupedErrors) {
          const countStr = count > 1 ? ` ×${count}` : '';
          output.push(`• ${msg}${countStr}`);
        }
      }
    } catch { /* skip */ }
  }

  return output.join('\n');
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

// Sprint 637: /smoke — Pipeline smoke test (async, long-running)
export async function cmdSmoke(chatId: string): Promise<void> {
  await sendMessage(chatId, '🔥 Running pipeline smoke test... (this takes 1-3 min)');
  try {
    const { exec } = require('child_process');
    const output: string = await new Promise((resolve, reject) => {
      exec(
        'npx ts-node --transpile-only scripts/scs001/validate-full-pipeline.ts',
        { cwd: ROOT, timeout: 240000, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
        (err: any, stdout: string, stderr: string) => {
          if (err && !stdout) reject(new Error(stderr || err.message));
          else resolve(stdout || stderr);
        }
      );
    });

    // Parse results
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    const icon = failed === 0 ? '✅' : '❌';

    // Sprint 1095: show last run timestamp
    let lastRunStr = '';
    try {
      const smokePath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
      if (fs.existsSync(smokePath)) {
        const prevSmoke = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
        if (prevSmoke.timestamp) {
          const ageH = (Date.now() - new Date(prevSmoke.timestamp).getTime()) / 3600000;
          lastRunStr = ` · _prev: ${ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`}_`;
        }
      }
    } catch {}

    const lines: string[] = [
      `${icon} *Pipeline Smoke Test*${lastRunStr}`,
      `${passed} passed, ${failed} failed`,
      '',
    ];

    // Extract individual check results
    for (const line of output.split('\n')) {
      if (line.includes('✓') || line.includes('✗')) {
        lines.push(line.trim());
      }
    }

    await sendMessage(chatId, lines.join('\n'));
  } catch (err: any) {
    await sendMessage(chatId, `❌ Smoke test error: ${(err.message || '').slice(0, 300)}`);
  }
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

  // PM2 — Sprint 642: show individual process statuses
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000, encoding: 'utf-8' });
    const procs = JSON.parse(pm2Out) as Array<{ name: string; pm2_env?: { status?: string } }>;
    const online = procs.filter((p) => p.pm2_env?.status === 'online');
    const stopped = procs.filter((p) => p.pm2_env?.status !== 'online');
    checks.push({ name: 'PM2 Processes', pass: online.length > 0, detail: `${online.length}/${procs.length} online` });
    if (online.length > 0) {
      checks.push({ name: 'PM2 Online', pass: true, detail: online.map(p => p.name).join(', ') });
    }
    if (stopped.length > 0 && stopped.length <= 20) {
      const critical = stopped.filter(p => ['telegram-bot', 'achiri-api', 'kognai-stripe-webhook', 'clawrouter-gateway'].includes(p.name));
      if (critical.length > 0) {
        checks.push({ name: 'PM2 Critical Stopped', pass: false, detail: critical.map(p => p.name).join(', ') });
      }
    }
  } catch {
    checks.push({ name: 'PM2 Processes', pass: false, detail: '❌ pm2 not running' });
  }

  // Sprint 640: Achiri test suite
  try {
    const testReport = path.join(ROOT, 'reports', 'achiri-test-suite.json');
    if (fs.existsSync(testReport)) {
      const tr = JSON.parse(fs.readFileSync(testReport, 'utf-8'));
      checks.push({ name: 'Achiri Tests', pass: tr.failed <= 1, detail: `${tr.passed}/${tr.total} pass` });
    }
  } catch {}

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

// Sprint 674: /testsuite — Run validation suite and report results
export async function cmdTestSuite(chatId: string): Promise<void> {
  await sendMessage(chatId, '🧪 Running validation suite... (5-10s)');
  try {
    const output = execSync(
      'npx ts-node --transpile-only scripts/scs001/run-validation-suite.ts --quick --telegram',
      { cwd: ROOT, stdio: 'pipe', timeout: 30_000 }
    ).toString();
    await sendMessage(chatId, output || '✅ Validation suite completed.');
  } catch (e: any) {
    const stdout = e.stdout?.toString() || '';
    const stderr = e.stderr?.toString()?.slice(-200) || '';
    await sendMessage(chatId, stdout || `❌ Validation suite error:\n\`${stderr}\``);
  }
}

// Sprint 691: /approve-finetune — Godman-only command to approve LoRA fine-tuning cycle
export async function cmdApproveFinetune(chatId: string, args: string): Promise<void> {
  const registryPath = path.join(ROOT, 'codebook', 'model-registry.json');
  if (!fs.existsSync(registryPath)) {
    await sendMessage(chatId, '❌ Model registry not found. Run Sprint 690 first.');
    return;
  }

  const reg = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const entries = reg.entries || [];

  if (!args.trim()) {
    // Show registry status
    const lines = entries.map((e: any) =>
      `• ${e.id} | ${e.base_model} | ${e.status} | corpus: ${e.corpus_entries} entries`
    );
    await sendMessage(chatId,
      `🧬 *Model Registry* (${entries.length} entries)\n\n` +
      lines.join('\n') +
      '\n\nUsage: /approveft <entry-id> to approve for fine-tuning'
    );
    return;
  }

  const targetId = args.trim();
  const entry = entries.find((e: any) => e.id === targetId);
  if (!entry) {
    await sendMessage(chatId, `❌ Entry "${targetId}" not found in registry.`);
    return;
  }

  if (entry.godman_approval_timestamp) {
    await sendMessage(chatId, `⚠️ Entry "${targetId}" already approved at ${entry.godman_approval_timestamp}`);
    return;
  }

  // Stub: mark as approved but don't trigger actual fine-tuning yet
  entry.godman_approval_timestamp = new Date().toISOString();
  entry.status = 'approved';
  fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n', 'utf-8');

  await sendMessage(chatId,
    `✅ Entry "${targetId}" approved by Godman.\n\n` +
    `Base: ${entry.base_model}\n` +
    `Corpus: ${entry.corpus_entries} entries\n` +
    `SHA: ${entry.corpus_sha256?.slice(0, 16)}...\n\n` +
    `⚠️ Fine-tuning not yet implemented (AMD-15 Phase 2+). Approval recorded.`
  );
}

// Sprint 705: BrainX database status
export function cmdBrainxStatus(): string {
  const statusPath = path.join(ROOT, 'reports', 'brainx-status.json');
  try {
    const status = readJSON(statusPath) as any;
    if (!status) return '🧠 BrainX DB: Unknown\n\nRun: `npx ts-node scripts/verify-brainx-db.ts`';
    const lines = [`🧠 *BrainX DB*: ${status.overall}`];
    for (const c of status.checks || []) {
      const icon = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
      lines.push(`${icon} ${c.check}: ${c.detail}`);
    }
    if (status.overall !== 'READY') {
      lines.push('\n⚠️ Run `npx ts-node scripts/verify-brainx-db.ts` for setup commands');
    }
    return lines.join('\n');
  } catch {
    return '🧠 BrainX DB: Unknown\n\nRun: `npx ts-node scripts/verify-brainx-db.ts`';
  }
}

// Sprint 718: Swarm health score
export function cmdSwarmHealth(): string {
  const healthPath = path.join(ROOT, 'workspace', 'swarm-health.json');
  try {
    const health = readJSON(healthPath) as any;
    if (!health) return '🏥 Swarm Health: Unknown\n\nRun: `npx ts-node scripts/lib/swarm-health.ts`';
    const icon = health.overall_status === 'GREEN' ? '🟢' : health.overall_status === 'YELLOW' ? '🟡' : '🔴';
    const c = health.components;
    return [
      `${icon} *Swarm Health*: ${health.overall_score}/100 (${health.overall_status})`,
      ``,
      `📊 *Components:*`,
      `  ACP Trust (40%): ${c.acp_trust.score} — ${c.acp_trust.detail}`,
      `  Success Rate (20%): ${c.success_rate.score} — ${c.success_rate.detail}`,
      `  Sprint Velocity (20%): ${c.sprint_velocity.score} — ${c.sprint_velocity.detail}`,
      `  Pipeline Output (20%): ${c.pipeline_output.score} — ${c.pipeline_output.detail}`,
      ``,
      `Agents: ${health.agent_count} registered`,
      `Updated: ${health.timestamp?.slice(0, 19) || 'unknown'}`,
    ].join('\n');
  } catch {
    return '🏥 Swarm Health: Unknown\n\nRun: `npx ts-node scripts/lib/swarm-health.ts`';
  }
}

/**
 * /browser-test — Sprint 784: Check Browser Use installation status
 */
export function cmdBrowserTest(): string {
  const venvPath = path.join(ROOT, '.venv-browser-use');
  const venvExists = fs.existsSync(venvPath);
  const scriptExists = fs.existsSync(path.join(ROOT, 'scripts', 'scs001', 'browser-upload-test.py'));

  const lines = ['🌐 *Browser Use Status*', ''];

  if (!venvExists) {
    lines.push('❌ Not installed');
    lines.push('');
    lines.push('Run: `bash scripts/scs001/install-browser-use.sh`');
    lines.push('');
    lines.push('Requirements:');
    lines.push('• Python 3.11+ (Homebrew)');
    lines.push('• Logged into TikTok in Chrome');
    lines.push('• Warmup complete (/warmup-status)');
    return lines.join('\n');
  }

  lines.push('✅ Virtual environment: installed');
  lines.push(`✅ Upload test script: ${scriptExists ? 'ready' : 'missing'}`);
  lines.push('');
  lines.push('To test (dry run):');
  lines.push('```');
  lines.push('source .venv-browser-use/bin/activate');
  lines.push('python scripts/scs001/browser-upload-test.py --dry-run');
  lines.push('```');
  lines.push('');
  lines.push('To upload:');
  lines.push('```');
  lines.push('bash scripts/scs001/post-tiktok-browser.sh /path/to/video.mp4 "caption"');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Sprint 995: /godman — Godman Protocols launch readiness dashboard
 * Shows build status, test counts, launch countdown, and checklist.
 */
export function cmdGodman(): string {
  const PROTOCOLS = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs'];
  const BASE = path.join(ROOT, 'workspace', 'godman-protocols');
  const lines: string[] = ['*Godman Protocols — Launch Dashboard*\n'];

  // Countdown
  const LAUNCH = new Date('2026-04-14T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((LAUNCH.getTime() - now.getTime()) / 86_400_000));
  lines.push(`📅 *Launch: April 14* — ${daysLeft} days remaining\n`);

  // Protocol status
  let allOk = true;
  for (const proto of PROTOCOLS) {
    const pkgPath = path.join(BASE, proto, 'package.json');
    const distPath = path.join(BASE, proto, 'dist');
    let version = '?';
    let hasDist = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      version = pkg.version || '?';
    } catch { /* skip */ }
    try { hasDist = fs.existsSync(distPath) && fs.readdirSync(distPath).length > 0; } catch {}
    const icon = hasDist ? '✅' : '⚠️';
    if (!hasDist) allOk = false;
    lines.push(`${icon} \`@godman-protocols/${proto}\` v${version}${hasDist ? ' — built' : ' — needs build'}`);
  }

  // SDK
  const sdkPkg = path.join(BASE, 'sdk', 'package.json');
  let sdkVersion = '?';
  try { sdkVersion = JSON.parse(fs.readFileSync(sdkPkg, 'utf-8')).version || '?'; } catch {}
  lines.push(`📦 \`@godman-protocols/sdk\` v${sdkVersion}`);

  // Integration test
  const integPath = path.join(BASE, 'integration.test.ts');
  const hasInteg = fs.existsSync(integPath);
  lines.push(`\n🧪 Integration test: ${hasInteg ? 'ready' : 'missing'}`);

  // Launch script
  const launchScript = path.join(ROOT, 'scripts', 'godman-launch-day.sh');
  const hasLaunch = fs.existsSync(launchScript);
  lines.push(`🚀 Launch script: ${hasLaunch ? 'ready' : 'missing'}`);

  // X megathread (suite launch)
  const megathreadPath = path.join(ROOT, 'workspace', 'social', 'suite-launch', 'x-megathread.md');
  let tweetCount = 0;
  try {
    if (fs.existsSync(megathreadPath)) {
      tweetCount = (fs.readFileSync(megathreadPath, 'utf-8').match(/^## Tweet \d/gm) || []).length;
    }
  } catch {}
  lines.push(`📣 X megathread: ${tweetCount > 0 ? `✅ ready (${tweetCount} tweets) — /godman-thread to preview` : '❌ not found'}`);

  // Sprint 1062 + 1089: CHANGELOG.md per-protocol check
  const changelogResults = PROTOCOLS.concat(['sdk']).map(p => ({
    name: p,
    ok: fs.existsSync(path.join(BASE, p, 'CHANGELOG.md')),
  }));
  const missingChangelog = changelogResults.filter(r => !r.ok);
  if (missingChangelog.length === 0) {
    lines.push(`📋 CHANGELOGs: ✅ all 8 present`);
  } else {
    lines.push(`📋 CHANGELOGs: ❌ missing in: ${missingChangelog.map(r => r.name).join(', ')}`);
    for (const r of changelogResults) {
      lines.push(`  ${r.ok ? '✅' : '❌'} ${r.name}`);
    }
  }

  // Sprint 1062: SDK api.md presence check
  const apiMdPath = path.join(BASE, 'sdk', 'docs', 'api.md');
  const hasApiMd = fs.existsSync(apiMdPath);
  lines.push(`📖 SDK docs/api.md: ${hasApiMd ? '✅ present' : '❌ missing'}`);

  // Sprint 1013: Demo videos + npm status
  const demoBase = path.join(ROOT, 'workspace', 'scs001', 'code-demo-runs');
  const hasPactDemo = fs.existsSync(path.join(demoBase, 'pact-demo-v1/pact-demo-v1.mp4'));
  const hasIntegDemo = fs.existsSync(path.join(demoBase, 'godman-integration-v1/godman-integration-v1.mp4'));
  lines.push(`🎬 PACT demo mp4: ${hasPactDemo ? 'ready' : 'run Spielberg'}`);
  lines.push(`🎬 Integration demo mp4: ${hasIntegDemo ? 'ready (all-7)' : 'run Spielberg'}`);

  // Sprint 1014: npm registry versions
  const protocols = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs'];
  lines.push('');
  lines.push('*npm registry:*');
  for (const proto of protocols) {
    let ver = '';
    try { ver = execSync(`npm view @godman-protocols/${proto} version 2>/dev/null`, { encoding: 'utf-8', timeout: 8000, stdio: ['pipe','pipe','pipe'] }).trim(); } catch {}
    lines.push(`  ${ver ? `✅ @godman-protocols/${proto} v${ver}` : `❌ @godman-protocols/${proto} — NOT PUBLISHED`}`);
  }

  // Sprint 1105: npm run build clean check for all 8 packages
  lines.push('');
  lines.push('*Build clean check:*');
  for (const proto of PROTOCOLS.concat(['sdk'])) {
    const protoDir = path.join(BASE, proto);
    if (!fs.existsSync(path.join(protoDir, 'package.json'))) {
      lines.push(`  ⚠️ ${proto} — no package.json`);
      continue;
    }
    try {
      execSync('npm run build 2>&1', { cwd: protoDir, encoding: 'utf-8', timeout: 30000, stdio: ['pipe','pipe','pipe'] });
      lines.push(`  ✅ ${proto} — build ok`);
    } catch (e: any) {
      const firstErr = ((e.stderr ?? e.stdout ?? e.message ?? '') as string).split('\n').find(l => l.includes('error TS') || l.includes('Error')) ?? 'build error';
      lines.push(`  ❌ ${proto} — ${firstErr.trim().slice(0, 80)}`);
    }
  }

  // Sprint 1112: per-protocol test pass counts
  lines.push('');
  lines.push('*Test coverage:*');
  for (const proto of PROTOCOLS.concat(['sdk'])) {
    const protoDir = path.join(BASE, proto);
    if (!fs.existsSync(path.join(protoDir, 'package.json'))) {
      lines.push(`  ⚠️ ${proto} — no package.json`);
      continue;
    }
    const pkgJson = JSON.parse(fs.readFileSync(path.join(protoDir, 'package.json'), 'utf-8'));
    if (!pkgJson.scripts?.test) {
      lines.push(`  ℹ️ ${proto} — no test script`);
      continue;
    }
    try {
      const out = execSync('npm test 2>&1', { cwd: protoDir, encoding: 'utf-8', timeout: 30000, stdio: ['pipe','pipe','pipe'] });
      const passMatch = out.match(/(\d+)\s+passing/);
      const failMatch = out.match(/(\d+)\s+failing/);
      const passing = passMatch ? parseInt(passMatch[1]) : null;
      const failing = failMatch ? parseInt(failMatch[1]) : 0;
      if (passing !== null) {
        lines.push(failing === 0 ? `  ✅ ${proto} — ${passing} tests pass` : `  ❌ ${proto} — ${passing} pass, ${failing} fail`);
      } else {
        lines.push(`  ✅ ${proto} — tests ok`);
      }
    } catch (e: any) {
      const out = (e.stdout ?? e.stderr ?? e.message ?? '') as string;
      const failMatch = out.match(/(\d+)\s+failing/);
      const passMatch = out.match(/(\d+)\s+passing/);
      const failing = failMatch ? parseInt(failMatch[1]) : '?';
      const passing = passMatch ? passMatch[1] : '0';
      lines.push(`  ❌ ${proto} — ${passing} pass, ${failing} fail`);
    }
  }

  // Sprint 1098: npm pack --dry-run check per protocol
  lines.push('');
  lines.push('*npm pack (dry-run):*');
  for (const proto of protocols) {
    const protoDir = path.join(BASE, proto);
    if (!fs.existsSync(path.join(protoDir, 'package.json'))) {
      lines.push(`  ❌ ${proto} — no package.json`);
      continue;
    }
    try {
      execSync('npm pack --dry-run 2>&1', { cwd: protoDir, encoding: 'utf-8', timeout: 10000, stdio: ['pipe','pipe','pipe'] });
      lines.push(`  ✅ ${proto} — packable`);
    } catch (e: any) {
      const msg = (e.stderr || e.message || '').split('\n')[0].slice(0, 60);
      lines.push(`  ❌ ${proto} — ${msg}`);
    }
  }

  // Sprint 1100: npm publish --dry-run (only when npm is logged in)
  const isNpmLoggedIn = (() => { try { return !!execSync('npm whoami 2>/dev/null', { encoding: 'utf-8', timeout: 3000, stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return false; } })();
  if (isNpmLoggedIn) {
    lines.push('');
    lines.push('*npm publish dry-run:*');
    for (const proto of protocols) {
      const protoDir = path.join(BASE, proto);
      try {
        execSync('npm publish --dry-run 2>&1', { cwd: protoDir, encoding: 'utf-8', timeout: 15000, stdio: ['pipe','pipe','pipe'] });
        lines.push(`  ✅ ${proto} — publish dry-run ok`);
      } catch (e: any) {
        const firstLine = ((e.stderr ?? e.stdout ?? e.message ?? '') as string).split('\n').find(l => l.trim() && !l.includes('npm notice')) ?? 'error';
        lines.push(`  ❌ ${proto} — ${firstLine.trim().slice(0, 80)}`);
      }
    }
  }

  // X engagement replies (intel reply drafts)
  const xRepliesDir = path.join(ROOT, 'workspace', 'social', 'x-replies');
  let xCount = 0;
  try {
    xCount = fs.readdirSync(xRepliesDir).filter(f => f.endsWith('.md') || f.endsWith('.txt')).length;
  } catch {}
  lines.push('');
  lines.push(`💬 X engagement replies: ${xCount > 0 ? `✅ ${xCount} drafts ready` : '❌ none found'}`);

  // npm login
  let npmWhoami = '';
  try { npmWhoami = execSync('npm whoami', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe','pipe','pipe'] }).trim(); } catch {}
  lines.push(`🔑 npm login: ${npmWhoami ? `✅ ${npmWhoami}` : '❌ run: npm login'}`);

  // Overall
  lines.push('');
  if (allOk && hasLaunch) {
    lines.push(`✅ *LAUNCH READY* — run dry-run to verify:`);
    lines.push('`./scripts/godman-launch-day.sh --dry-run`');
  } else {
    lines.push(`⚠️ *Not fully ready* — run \`tsc\` in each protocol dir`);
  }

  return lines.join('\n');
}

// Sprint 1029: /godman-thread — X megathread for launch day copy-paste
export function cmdGodmanThread(): string {
  const threadPath = path.join(ROOT, 'workspace', 'social', 'suite-launch', 'x-megathread.md');
  if (!fs.existsSync(threadPath)) return '❌ X megathread not found: workspace/social/suite-launch/x-megathread.md';

  const content = fs.readFileSync(threadPath, 'utf-8');
  const lines = content.split('\n');

  // Extract tweet sections
  const tweets: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('## Tweet')) {
      if (current) tweets.push({ title: current.title, body: current.lines.join('\n').trim() });
      current = { title: line.replace('## ', ''), lines: [] };
    } else if (current && line !== '---') {
      current.lines.push(line);
    }
  }
  if (current) tweets.push({ title: current.title, body: current.lines.join('\n').trim() });

  if (tweets.length === 0) return '❌ No tweets found in megathread file.';

  // Sprint 1102: add copy-paste tip + total lines count
  const totalLines = tweets.reduce((s, t) => s + t.body.split('\n').filter(l => l.trim()).length, 0);
  const out: string[] = [
    `📢 *Godman X Launch Thread* — ${tweets.length} tweets · ${totalLines} lines`,
    `_April 14, 2026 · @invoica\\_ai_`,
    `_Tap each code block → copy → paste to X. Post in order._`,
    '',
  ];

  for (let i = 0; i < tweets.length; i++) {
    const t = tweets[i];
    // Truncate body to 280 chars for X
    const body = t.body.replace(/\*\*/g, '').replace(/\*/g, '');
    const preview = body.length > 280 ? body.slice(0, 277) + '...' : body;
    out.push(`*${t.title}*`);
    out.push('```');
    out.push(preview);
    out.push('```');
    out.push('');
  }

  return out.join('\n');
}

// Sprint 1054: /pm2errors — last 5 error log lines per critical PM2 process
export function cmdPm2Errors(): string {
  const CRITICAL = ['telegram-bot', 'achiri-telegram', 'achiri-api', 'kognai-stripe-webhook'];
  const logDir = path.join(ROOT, 'logs');
  const lines: string[] = ['*🔴 PM2 Error Logs*\n'];
  let hasErrors = false;

  for (const proc of CRITICAL) {
    const logFile = path.join(logDir, `${proc.replace('kognai-', '')}-error.log`);
    const altFile = path.join(logDir, `${proc}-error.log`);
    const file = fs.existsSync(logFile) ? logFile : fs.existsSync(altFile) ? altFile : null;

    if (!file) {
      lines.push(`*${proc}*: _no error log_`);
      continue;
    }

    try {
      const content = fs.readFileSync(file, 'utf-8');
      const allLines = content.split('\n').filter(l => l.trim()).slice(-5);
      if (allLines.length === 0) {
        lines.push(`*${proc}*: ✅ clean`);
      } else {
        hasErrors = true;
        lines.push(`*${proc}*:`);
        lines.push('```');
        for (const l of allLines) {
          lines.push(l.slice(0, 100));
        }
        lines.push('```');
      }
    } catch {
      lines.push(`*${proc}*: _could not read log_`);
    }
    lines.push('');
  }

  if (!hasErrors) {
    lines.push('✅ All critical process error logs are clean.');
  }

  return lines.join('\n');
}
