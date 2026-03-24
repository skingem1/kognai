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
    // Sprint 1136 (wave 15): restart rate (restarts/hour) for high-restart procs
    const highRestartRate = procs.filter(p => {
      if (p.restarts < 5) return false;
      const uptimeH = p.uptimeMs > 0 ? p.uptimeMs / 3600000 : 1;
      return p.restarts / Math.max(1, uptimeH) >= 1; // ≥1 restart/hour is notable
    });
    if (highRestartRate.length > 0) {
      warnLines.push(`⚠️ *High restart rate (≥1/hr):*`);
      for (const p of highRestartRate) {
        const uptimeH = p.uptimeMs > 0 ? p.uptimeMs / 3600000 : 1;
        const rate = (p.restarts / Math.max(1, uptimeH)).toFixed(1);
        warnLines.push(`  🔁 \`${p.name}\` — ${rate}/hr (${p.restarts} total)`);
      }
    }
    if (warnLines.length > 0) memWarnSection = '\n\n' + warnLines.join('\n');
  } catch { /* skip */ }

  // Sprint 1133 (wave 13): top 5 processes by memory usage
  // Sprint 1139 (wave 16): total PM2 memory footprint
  let memTableSection = '';
  try {
    const procs = getPm2List();
    const top5 = procs
      .filter(p => p.memory > 0)
      .sort((a, b) => b.memory - a.memory)
      .slice(0, 5);
    const totalMemBytes = procs.reduce((s, p) => s + p.memory, 0);
    const totalMemStr = fmtMem(totalMemBytes);
    const footprintIcon = totalMemBytes > 1024 * 1024 * 1024 ? '⚠️' : '✅';
    if (top5.length > 0) {
      const rows = top5.map(p => `  \`${p.name.slice(0, 20).padEnd(20)}\` ${fmtMem(p.memory)}`).join('\n');
      memTableSection = `\n\n*Memory (top 5 / total ${footprintIcon} ${totalMemStr}):*\n${rows}`;
    } else {
      memTableSection = `\n\n*Memory footprint:* ${footprintIcon} ${totalMemStr} across ${procs.length} processes`;
    }
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

  // Sprint 1113: Mac Mini disk space (vault)
  let diskSection = '';
  try {
    const dfOut = execSync('df -h / 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim();
    const dfLine = dfOut.split('\n')[1] ?? '';
    const parts = dfLine.trim().split(/\s+/);
    // Columns: Filesystem  Size  Used  Avail  Use%  Mounted
    if (parts.length >= 5) {
      const used = parts[2] ?? '?', avail = parts[3] ?? '?', pct = parts[4] ?? '?';
      const pctNum = parseInt(pct);
      const diskIcon = pctNum >= 90 ? '🔴' : pctNum >= 75 ? '🟠' : '✅';
      diskSection = `\n\n*Disk (vault):* ${diskIcon} ${used} used · ${avail} free · ${pct} full`;
    }
  } catch {}

  // Sprint 1123: last watchdog run timestamp
  let watchdogSection = '';
  try {
    const wdPath = path.join(ROOT, 'reports', 'watchdog-latest.json');
    if (fs.existsSync(wdPath)) {
      const wd = JSON.parse(fs.readFileSync(wdPath, 'utf-8'));
      const ts = wd.timestamp ?? wd.generated_at;
      if (ts) {
        const ageH = (Date.now() - new Date(ts).getTime()) / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`;
        const wdIcon = ageH > 25 ? '⚠️' : '✅';
        watchdogSection = `\n\n*Watchdog:* ${wdIcon} last run ${ageStr}`;
      }
    }
  } catch {}

  // Sprint 1123: Node.js and npm versions
  let runtimeSection = '';
  try {
    const nodeVer = process.version ?? 'unknown';
    let npmVer = 'unknown';
    try { npmVer = execSync('npm --version 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim(); } catch {}
    runtimeSection = `\n\n*Runtime:* Node ${nodeVer} · npm ${npmVer}`;
  } catch {}

  // Sprint 1123: Tailscale VPN status
  let tailscaleSection = '';
  try {
    const tsOut = execSync('tailscale status --json 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    const tsData = JSON.parse(tsOut);
    const backendState = tsData.BackendState ?? 'Unknown';
    const self = tsData.Self;
    const ip = self?.TailscaleIPs?.[0] ?? '';
    const tsIcon = backendState === 'Running' ? '✅' : '⚠️';
    tailscaleSection = `\n\n*Tailscale:* ${tsIcon} ${backendState}${ip ? ` · ${ip}` : ''}`;
  } catch {
    tailscaleSection = '\n\n*Tailscale:* ℹ️ not installed or not running';
  }

  // Sprint 1136 (wave 14): ping Hetzner VPS via Tailscale IP from shared-infra
  let hetznerSection = '';
  try {
    const hetznerIp = process.env.HETZNER_TAILSCALE_IP ?? '';
    if (hetznerIp) {
      const pingOut = execSync(`ping -c 1 -W 2 ${hetznerIp} 2>&1`, { encoding: 'utf-8', timeout: 5000 }).trim();
      const reachable = pingOut.includes('1 packets received') || pingOut.includes('1 received');
      hetznerSection = `\n\n*Hetzner VPS:* ${reachable ? '✅ reachable' : '❌ unreachable'} (${hetznerIp})`;
    }
  } catch {
    hetznerSection = '\n\n*Hetzner VPS:* ⚠️ HETZNER_TAILSCALE_IP not set or ping failed';
  }

  // Sprint 1139 (wave 17): telegram-bot process uptime
  // Sprint 1139 (wave 18): PM2 stability score (processes with 0 restarts)
  let botUptimeSection = '';
  try {
    const procs = getPm2List();
    const botProc = procs.find(p => p.name === 'telegram-bot');
    if (botProc) {
      const uptimeStr = fmtUptime(botProc.uptimeMs);
      const icon = botProc.status === 'online' ? '✅' : '❌';
      botUptimeSection = `\n\n*Telegram Bot:* ${icon} ${botProc.status} · uptime ${uptimeStr}`;
    }
    const stableProcs = procs.filter(p => p.restarts === 0 && p.status === 'online').length;
    const totalProcs = procs.length;
    const stabIcon = stableProcs === totalProcs ? '✅' : stableProcs >= totalProcs * 0.8 ? '⚠️' : '❌';
    botUptimeSection += `\n*Stability:* ${stabIcon} ${stableProcs}/${totalProcs} processes with 0 restarts`;
  } catch { /* skip */ }

  // Sprint 1140 (wave 19): ANTHROPIC_API_KEY presence + truncated preview
  let anthropicSection = '';
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const preview = anthropicKey.length > 14 ? `${anthropicKey.slice(0, 10)}...${anthropicKey.slice(-4)}` : '(set)';
      anthropicSection = `\n\n*Claude API key:* ✅ set — \`${preview}\``;
    } else {
      anthropicSection = `\n\n*Claude API key:* ❌ ANTHROPIC_API_KEY not set`;
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 21): last Supabase sync via health.json last_heartbeat
  let supabaseSyncSection = '';
  try {
    const hPath2 = path.join(ROOT, 'health.json');
    if (fs.existsSync(hPath2)) {
      const h2 = JSON.parse(fs.readFileSync(hPath2, 'utf-8'));
      const lastBeat = h2.last_heartbeat;
      if (lastBeat) {
        const ageH = (Date.now() - new Date(lastBeat).getTime()) / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`;
        const icon = ageH > 2 ? '⚠️' : '✅';
        supabaseSyncSection = `\n\n*Last Supabase sync (heartbeat):* ${icon} ${ageStr}`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1136 (wave 20): disk I/O wait % from iostat (Mac)
  let ioSection = '';
  try {
    const ioOut = execSync('iostat -c 2 -w 1 2>/dev/null | tail -1', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (ioOut) {
      const parts = ioOut.trim().split(/\s+/);
      // iostat columns on macOS: cpu us sy id  disk0 KB/t tps MB/s  ...
      // The "id" (idle) column is typically index 2 in the cpu section
      const idlePct = parseFloat(parts[2]);
      if (!isNaN(idlePct)) {
        const ioPct = Math.max(0, 100 - idlePct);
        const ioIcon = ioPct > 50 ? '🔴' : ioPct > 25 ? '⚠️' : '✅';
        ioSection = `\n\n*Disk I/O wait:* ${ioIcon} ${ioPct.toFixed(0)}% (CPU idle: ${idlePct.toFixed(0)}%)`;
      }
    }
  } catch { /* skip — iostat may not be available */ }

  // Sprint 1137 (wave 22): check if morning-brief cron fired today
  let morningBriefSection = '';
  try {
    const mbLogPath = path.join(ROOT, 'logs', 'scs001-morning-brief-out.log');
    const todayMidnight = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    if (fs.existsSync(mbLogPath)) {
      const stat = fs.statSync(mbLogPath);
      const lastModToday = stat.mtimeMs >= todayMidnight;
      const timeStr = new Date(stat.mtimeMs).toISOString().slice(11, 16) + ' UTC';
      morningBriefSection = `\n\n*Morning brief:* ${lastModToday ? `✅ sent ${timeStr}` : '⚠️ not sent today'}`;
    }
  } catch { /* skip */ }

  // Sprint 1145 (wave 22): check if kognai-daily-digest cron ran today
  let digestSection = '';
  try {
    const digestLogPath = path.join(ROOT, 'logs', 'kognai-daily-digest-out.log');
    const todayMidnight2 = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    if (fs.existsSync(digestLogPath)) {
      const stat = fs.statSync(digestLogPath);
      const lastModToday = stat.mtimeMs >= todayMidnight2;
      const timeStr = new Date(stat.mtimeMs).toISOString().slice(11, 16) + ' UTC';
      digestSection = `\n\n*Daily digest:* ${lastModToday ? `✅ ran ${timeStr}` : '⚠️ not run today'}`;
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 23): check if any PM2 cron has not fired in over 2 days
  let staleCronsSection = '';
  try {
    const pm2CronOut = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const pm2AllCrons: any[] = JSON.parse(pm2CronOut);
    const TWO_DAYS_MS = 2 * 86_400_000;
    const nowMs = Date.now();
    const staleCrons = pm2AllCrons.filter((p: any) => {
      if (!p.pm2_env?.cron_restart) return false;
      const lastFire = p.pm2_env?.pm_uptime ?? 0;
      return lastFire > 0 && (nowMs - lastFire) > TWO_DAYS_MS;
    });
    if (staleCrons.length > 0) {
      const staleList = staleCrons.map((p: any) => {
        const ageD = ((nowMs - (p.pm2_env.pm_uptime ?? 0)) / 86_400_000).toFixed(1);
        return `\`${p.name}\` (${ageD}d)`;
      }).join(', ');
      staleCronsSection = `\n\n⚠️ *Crons not fired in >2d:* ${staleList}`;
    }
  } catch { /* skip */ }

  // Sprint 1145 (wave 23): show SUPABASE_URL domain (sanity check not using wrong DB)
  let supabaseDomainSection = '';
  try {
    const sbUrlRaw = process.env.SUPABASE_URL;
    if (sbUrlRaw) {
      const domain = new URL(sbUrlRaw).hostname;
      supabaseDomainSection = `\n\n*Supabase DB:* 🌐 \`${domain}\``;
    } else {
      supabaseDomainSection = `\n\n*Supabase DB:* ⚠️ SUPABASE_URL not set`;
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 25): show git worktree count (detect accidental open worktrees)
  let worktreeSection = '';
  try {
    const wtOut = execSync('git worktree list 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 }).trim();
    const wtCount = wtOut.split('\n').filter(l => l.trim()).length;
    const wtIcon = wtCount > 2 ? '⚠️' : '✅';
    worktreeSection = `\n\n*Git worktrees:* ${wtIcon} ${wtCount} active${wtCount > 2 ? ` — check for leaks` : ''}`;
  } catch { /* skip */ }

  // Sprint 1145 (wave 25): show Node.js memory usage of telegram-bot process
  let botMemSection = '';
  try {
    const pm2OutBotMem = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const pm2BotList: any[] = JSON.parse(pm2OutBotMem);
    const botProc = pm2BotList.find((p: any) => p.name === 'telegram-bot' || p.name === 'kognai-telegram-bot');
    if (botProc) {
      const rss = botProc.monit?.memory ?? botProc.pm2_env?.axm_monitor?.['Heap Size']?.value ?? 0;
      if (rss > 0) {
        const rssMB = (rss / 1024 / 1024).toFixed(0);
        const memIcon = rss > 400 * 1024 * 1024 ? '⚠️' : '✅';
        botMemSection = `\n\n*Telegram-bot memory:* ${memIcon} ${rssMB}MB RSS`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 24): show Anthropic API token budget estimate for today
  let anthropicBudgetSection = '';
  try {
    const apiLogPath = path.join(ROOT, 'logs', 'openclaw-gateway-out.log');
    const anthropicLogPath = path.join(ROOT, 'logs', 'anthropic-usage.jsonl');
    if (fs.existsSync(anthropicLogPath)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const usageLines = fs.readFileSync(anthropicLogPath, 'utf-8').split('\n').filter(l => l.trim());
      let todayTokens = 0;
      for (const l of usageLines) {
        try {
          const entry = JSON.parse(l);
          if ((entry.ts ?? entry.timestamp ?? '').startsWith(todayStr)) {
            todayTokens += (entry.input_tokens ?? 0) + (entry.output_tokens ?? 0);
          }
        } catch {}
      }
      if (todayTokens > 0) {
        const costEstimate = (todayTokens / 1_000_000 * 3.0).toFixed(4); // ~$3/M tokens (Sonnet)
        const tokenIcon = todayTokens > 500_000 ? '⚠️' : '✅';
        anthropicBudgetSection = `\n\n*Claude API today:* ${tokenIcon} ${(todayTokens / 1000).toFixed(0)}K tokens · ~$${costEstimate}`;
      }
    } else if (fs.existsSync(apiLogPath)) {
      // Fallback: count "tokens" mentions in gateway log for today
      const todayMidnightMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
      const stat = fs.statSync(apiLogPath);
      if (stat.mtimeMs >= todayMidnightMs) {
        anthropicBudgetSection = `\n\n*Claude API:* ✅ gateway active today`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1144 (wave 24): show whether validate-full-pipeline cron ran in last 24h
  let pipelineValidationSection = '';
  try {
    const latestRunPath = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
    if (fs.existsSync(latestRunPath)) {
      const runData = JSON.parse(fs.readFileSync(latestRunPath, 'utf-8'));
      const runTs = runData.completed_at ?? runData.started_at ?? runData.timestamp;
      if (runTs) {
        const ageH = (Date.now() - new Date(runTs).getTime()) / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`;
        const runIcon = ageH <= 24 ? '✅' : '⚠️';
        const statusStr = runData.status ?? (runData.passed >= 0 ? (runData.failed === 0 ? 'pass' : 'fail') : 'unknown');
        pipelineValidationSection = `\n\n*Pipeline validation:* ${runIcon} last run ${ageStr}${ageH > 24 ? ' — overdue!' : ''} · ${statusStr}`;
      }
    } else {
      pipelineValidationSection = `\n\n*Pipeline validation:* ⚠️ no run record found`;
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 26): show days until Phase 1.5 gate deadline
  let gateDaysSection = '';
  try {
    const GATE_DEADLINE = new Date('2026-04-07T00:00:00Z');
    const daysToGate = Math.ceil((GATE_DEADLINE.getTime() - Date.now()) / 86_400_000);
    const gateIcon = daysToGate <= 0 ? '🚨' : daysToGate <= 7 ? '🔴' : daysToGate <= 14 ? '⚠️' : '📅';
    if (daysToGate <= 0) {
      gateDaysSection = `\n\n${gateIcon} *Phase 1.5 gate:* DEADLINE PASSED ${Math.abs(daysToGate)}d ago`;
    } else {
      gateDaysSection = `\n\n${gateIcon} *Phase 1.5 gate:* ${daysToGate}d remaining (Apr 7)`;
    }
  } catch { /* skip */ }

  // Sprint 1145 (wave 26): show last backup timestamp from backup log if available
  let backupSection = '';
  try {
    const backupLogPath = path.join(ROOT, 'logs', 'backup.log');
    const backupStatusPath = path.join(ROOT, 'workspace', 'backup-status.json');
    if (fs.existsSync(backupStatusPath)) {
      const bStatus = JSON.parse(fs.readFileSync(backupStatusPath, 'utf-8'));
      const bTs = bStatus.last_backup ?? bStatus.timestamp ?? bStatus.completed_at;
      if (bTs) {
        const ageH = (Date.now() - new Date(bTs).getTime()) / 3600000;
        const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : ageH < 24 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
        const bIcon = ageH <= 25 ? '✅' : ageH <= 72 ? '⚠️' : '❌';
        backupSection = `\n\n${bIcon} *Last backup:* ${ageStr}`;
      }
    } else if (fs.existsSync(backupLogPath)) {
      const stat = fs.statSync(backupLogPath);
      const ageH = (Date.now() - stat.mtimeMs) / 3600000;
      const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : ageH < 24 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
      const bIcon = ageH <= 25 ? '✅' : ageH <= 72 ? '⚠️' : '❌';
      backupSection = `\n\n${bIcon} *Last backup log:* ${ageStr}`;
    } else {
      backupSection = `\n\n⚠️ *Backup:* no backup log found`;
    }
  } catch { /* skip */ }

  // Sprint 1146 (wave 26): posting-health.json gate summary
  let postingHealthSection = '';
  try {
    const phPath = path.join(ROOT, 'reports', 'posting-health.json');
    if (fs.existsSync(phPath)) {
      const ph = JSON.parse(fs.readFileSync(phPath, 'utf-8'));
      const phIcon = ph.all_pass ? '✅' : '⚠️';
      const gateCheck = (ph.checks ?? []).find((c: any) => c.name === 'Gate progress');
      const gateDetail = gateCheck?.detail ?? '';
      const phAgeH = ph.generated_at ? (Date.now() - new Date(ph.generated_at).getTime()) / 3600000 : null;
      const phAgeStr = phAgeH != null ? (phAgeH < 1 ? `${Math.round(phAgeH * 60)}m ago` : `${Math.round(phAgeH)}h ago`) : '';
      postingHealthSection = `\n\n${phIcon} *Posting health:* ${ph.all_pass ? 'all checks pass' : 'issues detected'}${gateDetail ? ` · ${gateDetail}` : ''}${phAgeStr ? ` _(${phAgeStr})_` : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1146 (wave 26): export-files.txt count (videos ready to post)
  let exportFilesSection = '';
  try {
    const efPath = path.join(ROOT, 'workspace', 'scs001', 'export-files.txt');
    if (fs.existsSync(efPath)) {
      const efLines = fs.readFileSync(efPath, 'utf-8').trim().split('\n').filter(Boolean);
      const efCount = efLines.length;
      const efIcon = efCount >= 5 ? '✅' : efCount > 0 ? '⚠️' : '❌';
      exportFilesSection = `\n\n${efIcon} *Export queue:* ${efCount} video${efCount !== 1 ? 's' : ''} ready to post`;
    }
  } catch { /* skip */ }

  // Sprint 1146 (wave 26): token-health.json TikTok token status
  let tokenHealthSection = '';
  try {
    const thPath = path.join(ROOT, 'reports', 'token-health.json');
    if (fs.existsSync(thPath)) {
      const th = JSON.parse(fs.readFileSync(thPath, 'utf-8'));
      const thStatus = th.status ?? 'UNKNOWN';
      const thIcon = thStatus === 'VALID' ? '✅' : thStatus === 'MISSING' ? '❌' : '⚠️';
      const expiry = th.hours_until_expiry != null ? ` · expires ${Math.round(th.hours_until_expiry)}h` : '';
      const action = thStatus !== 'VALID' && th.action ? ` — ${th.action.slice(0, 60)}` : '';
      tokenHealthSection = `\n\n${thIcon} *TikTok token:* ${thStatus}${expiry}${action}`;
    }
  } catch { /* skip */ }

  // Sprint 1147 (wave 27): stats-latest.json production summary
  let statsSection = '';
  try {
    const statsPath = path.join(ROOT, 'reports', 'stats-latest.json');
    if (fs.existsSync(statsPath)) {
      const st = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      const totalVid = st.production?.total_videos ?? 0;
      const todayVid = st.production?.videos_today ?? 0;
      const weekVid = st.production?.videos_this_week ?? 0;
      const runsToday = st.production?.pipeline_runs_today ?? 0;
      statsSection = `\n\n📊 *Production:* ${totalVid} total · ${weekVid} this week · ${todayVid} today · ${runsToday} runs today`;
    }
  } catch { /* skip */ }

  // Sprint 1147 (wave 27): video-inventory.json gate snapshot
  let inventorySection = '';
  try {
    const invPath = path.join(ROOT, 'reports', 'video-inventory.json');
    if (fs.existsSync(invPath)) {
      const inv = JSON.parse(fs.readFileSync(invPath, 'utf-8'));
      const posted = inv.gate_status?.posted ?? inv.already_posted ?? 0;
      const target = inv.gate_status?.target ?? 30;
      const gap = inv.gate_status?.gap ?? (target - posted);
      const ready = inv.ready_to_post ?? 0;
      const invIcon = posted >= target ? '✅' : gap <= 5 ? '🟠' : '📋';
      inventorySection = `\n\n${invIcon} *Video inventory:* ${posted}/${target} posted · ${gap} gap · ${ready} ready`;
    }
  } catch { /* skip */ }

  // Sprint 1148 (wave 27+): gate-audit.json real vs dry_run signal
  let gateAuditSection = '';
  try {
    const gaPath = path.join(ROOT, 'reports', 'gate-audit.json');
    if (fs.existsSync(gaPath)) {
      const ga = JSON.parse(fs.readFileSync(gaPath, 'utf-8'));
      const real = ga.sources?.manual_posts?.real ?? 0;
      const dryRuns = ga.sources?.manual_posts?.dry_runs ?? 0;
      const total = ga.sources?.manual_posts?.total ?? 0;
      const gaIcon = dryRuns > 0 ? '⚠️' : '✅';
      const dryStr = dryRuns > 0 ? ` · ${dryRuns} dry-run (not counted)` : '';
      gateAuditSection = `\n\n${gaIcon} *Gate audit:* ${real}/${total} real posts confirmed${dryStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1148 (wave 27+): auto-deliver PM2 cron health check
  let autoDeliverSection = '';
  try {
    const procs = getPm2List();
    const autoDeliverNames = ['auto-deliver-morning', 'auto-deliver-noon', 'auto-deliver-evening'];
    const adStatus = autoDeliverNames.map(n => {
      const p = procs.find((pr: any) => (pr.name ?? '').includes(n.replace('auto-deliver-', '')));
      return p ? (p.status === 'online' ? `✅ ${n.split('-').pop()}` : `❌ ${n.split('-').pop()}`) : `⚠️ ${n.split('-').pop()}`;
    });
    const allOnline = adStatus.every(s => s.startsWith('✅'));
    autoDeliverSection = `\n\n${allOnline ? '✅' : '⚠️'} *Auto-deliver:* ${adStatus.join(' · ')}`;
  } catch { /* skip */ }

  // Sprint 1149 (wave 28): bulk-captions.json total_ready vs posted
  let bulkCaptionsSection = '';
  try {
    const bcPath = path.join(ROOT, 'reports', 'bulk-captions.json');
    if (fs.existsSync(bcPath)) {
      const bc = JSON.parse(fs.readFileSync(bcPath, 'utf-8'));
      const totalReady = bc.total_ready ?? 0;
      const bcPosted = bc.posted ?? 0;
      const bcIcon = totalReady >= 10 ? '✅' : totalReady > 0 ? '⚠️' : '❌';
      bulkCaptionsSection = `\n\n${bcIcon} *Captioned & ready:* ${totalReady} videos · ${bcPosted} posted`;
    }
  } catch { /* skip */ }

  // Sprint 1149 (wave 28): video-playback-audit passed/failed
  let playbackSection = '';
  try {
    const paPath = path.join(ROOT, 'reports', 'video-playback-audit.json');
    if (fs.existsSync(paPath)) {
      const pa = JSON.parse(fs.readFileSync(paPath, 'utf-8'));
      const passed = pa.passed ?? 0;
      const failed = pa.failed ?? 0;
      const total = pa.total ?? (passed + failed);
      const paIcon = failed === 0 ? '✅' : failed <= 2 ? '⚠️' : '❌';
      const paAgeH = pa.timestamp ? (Date.now() - new Date(pa.timestamp).getTime()) / 3600000 : null;
      const paAgeStr = paAgeH != null && paAgeH < 48 ? ` _(${Math.round(paAgeH)}h ago)_` : '';
      playbackSection = `\n\n${paIcon} *Playback audit:* ${passed}/${total} pass${failed > 0 ? ` · ${failed} fail` : ''}${paAgeStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1149 (wave 28): quality01-validation.json QC status
  let qcSection = '';
  try {
    const qcPath = path.join(ROOT, 'workspace', 'scs001', 'quality01-validation.json');
    if (fs.existsSync(qcPath)) {
      const qc = JSON.parse(fs.readFileSync(qcPath, 'utf-8'));
      const qcStatus = qc.status ?? 'UNKNOWN';
      const qcIcon = qcStatus === 'PASS' ? '✅' : qcStatus === 'FAIL' ? '❌' : '⚠️';
      const failedChecks = (qc.checks ?? []).filter((c: any) => !c.pass).length;
      const failStr = failedChecks > 0 ? ` · ${failedChecks} checks failed` : '';
      qcSection = `\n\n${qcIcon} *QC validation:* ${qcStatus}${failStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1150 (wave 29): smoke-test-latest.json pass/fail summary
  let smokeSection = '';
  try {
    const smokePath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
    if (fs.existsSync(smokePath)) {
      const sm = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
      const smPass = sm.pass ?? sm.passed ?? 0;
      const smFail = sm.fail ?? sm.failed ?? 0;
      const smTotal = sm.total ?? (smPass + smFail);
      const smIcon = smFail === 0 ? '✅' : smFail <= 2 ? '⚠️' : '❌';
      const smAgeH = sm.timestamp ? (Date.now() - new Date(sm.timestamp).getTime()) / 3600000 : null;
      const smAgeStr = smAgeH != null && smAgeH < 48 ? ` _(${Math.round(smAgeH)}h ago)_` : '';
      smokeSection = `\n\n${smIcon} *Smoke test:* ${smPass}/${smTotal} pass${smFail > 0 ? ` · ${smFail} fail` : ''}${smAgeStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1150 (wave 29): achiri-analytics.json DAU + retention summary
  let achiriDauSection = '';
  try {
    const aaPath = path.join(ROOT, 'reports', 'achiri-analytics.json');
    if (fs.existsSync(aaPath)) {
      const aa = JSON.parse(fs.readFileSync(aaPath, 'utf-8'));
      const dau = aa.today?.dau ?? 0;
      const totalUsers = aa.overview?.total_users ?? 0;
      const retention = aa.overview?.retention_pct ?? 0;
      const msgs = aa.today?.msgs ?? 0;
      const aaIcon = dau > 0 ? '📱' : '💤';
      achiriDauSection = `\n\n${aaIcon} *Achiri:* ${dau} DAU · ${totalUsers} users · ${retention}% retention${msgs > 0 ? ` · ${msgs} msgs today` : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1150 (wave 29): achiri-e2e-latest.json passed/total
  let achiriE2eSection = '';
  try {
    const e2ePath = path.join(ROOT, 'reports', 'achiri-e2e-latest.json');
    if (fs.existsSync(e2ePath)) {
      const e2e = JSON.parse(fs.readFileSync(e2ePath, 'utf-8'));
      const e2ePassed = e2e.passed ?? 0;
      const e2eFailed = e2e.failed ?? 0;
      const e2eTotal = e2e.total ?? (e2ePassed + e2eFailed);
      const e2eIcon = e2eFailed === 0 ? '✅' : e2eFailed <= 3 ? '⚠️' : '❌';
      const e2eAgeH = e2e.timestamp ? (Date.now() - new Date(e2e.timestamp).getTime()) / 3600000 : null;
      const e2eAgeStr = e2eAgeH != null && e2eAgeH < 48 ? ` _(${Math.round(e2eAgeH)}h ago)_` : '';
      achiriE2eSection = `\n\n${e2eIcon} *Achiri E2E:* ${e2ePassed}/${e2eTotal} pass${e2eFailed > 0 ? ` · ${e2eFailed} fail` : ''}${e2eAgeStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1151 (wave 30): video-validation.json valid/total pass rate
  let videoValidSection = '';
  try {
    const vvPath = path.join(ROOT, 'reports', 'video-validation.json');
    if (fs.existsSync(vvPath)) {
      const vv = JSON.parse(fs.readFileSync(vvPath, 'utf-8'));
      const vvValid = vv.valid ?? 0;
      const vvTotal = vv.total ?? 0;
      const vvInvalid = vv.invalid ?? 0;
      const vvPassRate = vv.pass_rate ?? (vvTotal > 0 ? Math.round((vvValid / vvTotal) * 100) : 0);
      const vvIcon = vvInvalid === 0 ? '✅' : vvInvalid <= 3 ? '⚠️' : '❌';
      const vvAvgDur = vv.avg_duration != null ? ` · ${vv.avg_duration}s avg` : '';
      videoValidSection = `\n\n${vvIcon} *Video validation:* ${vvValid}/${vvTotal} valid · ${vvPassRate}% pass${vvAvgDur}`;
    }
  } catch { /* skip */ }

  // Sprint 1151 (wave 30): pipeline-metrics.json production summary
  let pipelineMetricsSection = '';
  try {
    const pmPath = path.join(ROOT, 'reports', 'pipeline-metrics.json');
    if (fs.existsSync(pmPath)) {
      const pm = JSON.parse(fs.readFileSync(pmPath, 'utf-8'));
      const pmRuns = pm.total_runs ?? 0;
      const pmErrors = pm.error_runs ?? 0;
      const pmPublished = pm.cumulative?.published ?? 0;
      const pmQcRate = pm.cumulative?.qc_pass_rate_pct ?? 0;
      const pmIcon = pmErrors === 0 ? '✅' : pmErrors <= 2 ? '⚠️' : '❌';
      pipelineMetricsSection = `\n\n${pmIcon} *Pipeline metrics:* ${pmRuns} runs · ${pmPublished} published · ${pmQcRate}% QC pass${pmErrors > 0 ? ` · ${pmErrors} errors` : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1151 (wave 30): achiri-safety-audit.json overall verdict
  let achiriSafetySection = '';
  try {
    const saPath = path.join(ROOT, 'reports', 'achiri-safety-audit.json');
    if (fs.existsSync(saPath)) {
      const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
      const saVerdict = sa.overall_verdict ?? 'UNKNOWN';
      const saScore = sa.score ?? 0;
      const saIcon = saVerdict === 'PASS' ? '🛡️' : '❌';
      achiriSafetySection = `\n\n${saIcon} *Achiri safety:* ${saVerdict} · ${saScore}/100`;
    }
  } catch { /* skip */ }

  // Sprint 1152 (wave 31): content-leaderboard.json top speaker summary
  let leaderboardSection = '';
  try {
    const lbPath = path.join(ROOT, 'reports', 'content-leaderboard.json');
    if (fs.existsSync(lbPath)) {
      const lb = JSON.parse(fs.readFileSync(lbPath, 'utf-8'));
      const speakers: any[] = lb.speakers ?? [];
      if (speakers.length > 0) {
        const top = speakers.reduce((a: any, b: any) => (b.count > a.count ? b : a), speakers[0]);
        const totalExp = lb.total_experiments ?? 0;
        leaderboardSection = `\n\n🏆 *Leaderboard:* ${top.name} leads · ${top.count} vids · ${top.avg_score?.toFixed(2)} avg${totalExp > 0 ? ` · ${totalExp} total` : ''}`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1152 (wave 31): brainx-status.json overall READY/WARN status
  let brainxSection = '';
  try {
    const bxPath = path.join(ROOT, 'reports', 'brainx-status.json');
    if (fs.existsSync(bxPath)) {
      const bx = JSON.parse(fs.readFileSync(bxPath, 'utf-8'));
      const bxOverall = bx.overall ?? 'UNKNOWN';
      const bxIcon = bxOverall === 'READY' ? '🧠' : bxOverall === 'WARN' ? '⚠️' : '❌';
      const warns = (bx.checks ?? []).filter((c: any) => c.status === 'WARN').length;
      const warnStr = warns > 0 ? ` · ${warns} warnings` : '';
      brainxSection = `\n\n${bxIcon} *BrainX:* ${bxOverall}${warnStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1152 (wave 31): achiri-alpha-report.json launch verdict + days to alpha
  let achiriLaunchSection = '';
  try {
    const arPath = path.join(ROOT, 'reports', 'achiri-alpha-report.json');
    if (fs.existsSync(arPath)) {
      const ar = JSON.parse(fs.readFileSync(arPath, 'utf-8'));
      const arVerdict = ar.verdict ?? 'UNKNOWN';
      const arDays = ar.daysToLaunch ?? 0;
      const arIcon = arVerdict === 'READY' ? '✅' : arVerdict === 'AT-RISK' ? '⚠️' : '❌';
      const pendingGates = (ar.gates ?? []).filter((g: any) => g.status === 'pending').length;
      const gateStr = pendingGates > 0 ? ` · ${pendingGates} gates pending` : '';
      achiriLaunchSection = `\n\n${arIcon} *Achiri launch:* ${arVerdict} · ${arDays}d to alpha${gateStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1153 (wave 32): posting-schedule.json next slot + pace needed
  let postingScheduleSection = '';
  try {
    const psPath = path.join(ROOT, 'reports', 'posting-schedule.json');
    if (fs.existsSync(psPath)) {
      const ps = JSON.parse(fs.readFileSync(psPath, 'utf-8'));
      const psDone = ps.posts_done ?? 0;
      const psTarget = ps.gate_target ?? 30;
      const psPace = ps.pace_needed ?? 0;
      const slots: any[] = ps.slots ?? [];
      const today = new Date().toISOString().slice(0, 10);
      const nextSlot = slots.find((s: any) => s.date >= today);
      const nextStr = nextSlot ? ` · next: ${nextSlot.date} ${nextSlot.time} (${nextSlot.speaker ?? 'unknown'})` : '';
      const psIcon = psDone >= psTarget ? '✅' : psPace > 3 ? '🔴' : psPace > 2 ? '⚠️' : '📅';
      postingScheduleSection = `\n\n${psIcon} *Post schedule:* ${psDone}/${psTarget} done · ${psPace}/day needed${nextStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1153 (wave 32): phase1-5-gate.json urgency signal
  let phase15GateSection = '';
  try {
    const p15Path = path.join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
    if (fs.existsSync(p15Path)) {
      const p15 = JSON.parse(fs.readFileSync(p15Path, 'utf-8'));
      const urgency = p15.urgency ?? 'UNKNOWN';
      const daysLeft = p15.days_remaining ?? 0;
      const paceNeeded = p15.pace_needed ?? 0;
      const p15Icon = urgency === 'ON_TRACK' ? '🟢' : urgency === 'AT_RISK' ? '🟡' : urgency === 'CRITICAL' ? '🔴' : '⚠️';
      phase15GateSection = `\n\n${p15Icon} *Gate 1.5:* ${urgency} · ${daysLeft}d left · ${paceNeeded}/day pace`;
    }
  } catch { /* skip */ }

  // Sprint 1153 (wave 32): batch-produce-latest.json runs completed
  let batchProduceSection = '';
  try {
    const bpPath = path.join(ROOT, 'reports', 'batch-produce-latest.json');
    if (fs.existsSync(bpPath)) {
      const bp = JSON.parse(fs.readFileSync(bpPath, 'utf-8'));
      const bpCompleted = bp.runs_completed ?? 0;
      const bpPlanned = bp.runs_planned ?? 0;
      const bpPipeline = bp.pipeline_filter ?? 'unknown';
      const bpIcon = bpCompleted === bpPlanned ? '✅' : '⚠️';
      const bpAgeH = bp.batch_at ? (Date.now() - new Date(bp.batch_at).getTime()) / 3600000 : null;
      const bpAgeStr = bpAgeH != null && bpAgeH < 48 ? ` _(${Math.round(bpAgeH)}h ago)_` : '';
      batchProduceSection = `\n\n${bpIcon} *Batch produce:* ${bpCompleted}/${bpPlanned} ${bpPipeline} runs${bpAgeStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1154 (wave 33): revenue-summary.json MRR + paid users
  let revenueSummarySection = '';
  try {
    const rvPath = path.join(ROOT, 'reports', 'revenue-summary.json');
    if (fs.existsSync(rvPath)) {
      const rv = JSON.parse(fs.readFileSync(rvPath, 'utf-8'));
      const mrr = rv.mrr ?? 0;
      const paidUsers = rv.paid_users ?? 0;
      const totalUsers = rv.total_users ?? 0;
      const rvIcon = mrr > 0 ? '💰' : paidUsers > 0 ? '🟡' : '⚪';
      revenueSummarySection = `\n\n${rvIcon} *Revenue:* €${mrr} MRR · ${paidUsers} paid / ${totalUsers} total users`;
    }
  } catch { /* skip */ }

  // Sprint 1154 (wave 33): content-diversity-audit.json unique hooks + topics
  let contentDiversitySection = '';
  try {
    const cdPath = path.join(ROOT, 'reports', 'content-diversity-audit.json');
    if (fs.existsSync(cdPath)) {
      const cd = JSON.parse(fs.readFileSync(cdPath, 'utf-8'));
      const totalVideos = cd.total_videos ?? 0;
      const uniqueHooks = cd.unique_hooks ?? 0;
      const uniqueTopics = cd.unique_topics ?? 0;
      const cdIcon = uniqueHooks >= 5 && uniqueTopics >= 10 ? '✅' : uniqueHooks >= 3 ? '🟡' : '⚠️';
      contentDiversitySection = `\n\n${cdIcon} *Content diversity:* ${totalVideos} vids · ${uniqueHooks} hooks · ${uniqueTopics} topics`;
    }
  } catch { /* skip */ }

  // Sprint 1154 (wave 33): cost-log.json monthly spend + cost per video
  let costLogSection = '';
  try {
    const clPath = path.join(ROOT, 'workspace', 'scs001', 'cost-log.json');
    if (fs.existsSync(clPath)) {
      const cl = JSON.parse(fs.readFileSync(clPath, 'utf-8'));
      const monthly = cl.monthly_summary ?? cl.all_time ?? {};
      const totalCost = monthly.total_cost ?? cl.all_time?.total_cost ?? 0;
      const costPerVideo = cl.all_time?.cost_per_video ?? 0;
      const videosGenerated = monthly.videos_generated ?? cl.all_time?.total_videos ?? 0;
      const clIcon = totalCost < 10 ? '🟢' : totalCost < 50 ? '🟡' : '🔴';
      costLogSection = `\n\n${clIcon} *Cost:* $${totalCost.toFixed(2)} this month · $${costPerVideo.toFixed(3)}/video · ${videosGenerated} generated`;
    }
  } catch { /* skip */ }

  // Sprint 1155 (wave 34): warmup-status.json warmup complete + days active
  let warmupSection = '';
  try {
    const wuPath = path.join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
    if (fs.existsSync(wuPath)) {
      const wu = JSON.parse(fs.readFileSync(wuPath, 'utf-8'));
      const wuComplete = wu.warmup_complete ?? false;
      const wuDays = wu.days_active ?? 0;
      const wuVerified = wu.verified ?? false;
      const wuIcon = wuComplete && wuVerified ? '✅' : wuComplete ? '🟡' : wuDays > 0 ? '🔄' : '⏳';
      const wuStatus = wuComplete ? 'complete' : `${wuDays}d active`;
      const wuVerStr = wuVerified ? ' · verified' : '';
      warmupSection = `\n\n${wuIcon} *Warmup:* ${wuStatus}${wuVerStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1155 (wave 34): ab-analysis-report.json top formula + experiments count
  let abAnalysisSection = '';
  try {
    const abPath = path.join(ROOT, 'workspace', 'scs001', 'ab-analysis-report.json');
    if (fs.existsSync(abPath)) {
      const ab = JSON.parse(fs.readFileSync(abPath, 'utf-8'));
      const totalExp = ab.total_experiments ?? 0;
      const rankings: any[] = ab.formula_rankings ?? [];
      const top = rankings.find((r: any) => r.rank === 1) ?? rankings[0];
      const abIcon = totalExp > 0 ? '🧪' : '⚪';
      const topStr = top ? ` · top: ${top.formula} (${(top.avg_score * 100).toFixed(0)}% avg)` : '';
      abAnalysisSection = `\n\n${abIcon} *A/B:* ${totalExp} experiments${topStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1155 (wave 34): production-quality-check.json all_critical_pass + date
  let prodQualitySection = '';
  try {
    const pqPath = path.join(ROOT, 'workspace', 'gates', 'production-quality-check.json');
    if (fs.existsSync(pqPath)) {
      const pq = JSON.parse(fs.readFileSync(pqPath, 'utf-8'));
      const allPass = pq.all_critical_pass ?? false;
      const pqDate = pq.date ?? 'unknown';
      const checks: any[] = pq.checks ?? [];
      const passCount = checks.filter((c: any) => c.pass).length;
      const totalChecks = checks.length;
      const pqIcon = allPass ? '✅' : '⚠️';
      prodQualitySection = `\n\n${pqIcon} *Prod quality:* ${passCount}/${totalChecks} checks · ${pqDate}`;
    }
  } catch { /* skip */ }

  // Sprint 1156 (wave 35): hook-weights.json top 2 formulas by weight
  let hookWeightsSection = '';
  try {
    const hwPath = path.join(ROOT, 'workspace', 'scs001', 'hook-weights.json');
    if (fs.existsSync(hwPath)) {
      const hw = JSON.parse(fs.readFileSync(hwPath, 'utf-8'));
      const weights: Record<string, number> = hw.weights ?? {};
      const sorted = Object.entries(weights).sort(([, a], [, b]) => b - a).slice(0, 2);
      if (sorted.length > 0) {
        const top2 = sorted.map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ');
        hookWeightsSection = `\n\n🎣 *Hook weights:* ${top2}`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1156 (wave 35): content-calendar.json days left + videos assigned
  let contentCalendarSection = '';
  try {
    const ccPath = path.join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
    if (fs.existsSync(ccPath)) {
      const cc = JSON.parse(fs.readFileSync(ccPath, 'utf-8'));
      const totalDays = cc.total_days ?? 0;
      const totalVideos = cc.total_videos_assigned ?? 0;
      const gateDate = cc.gate_date ? cc.gate_date.slice(0, 10) : 'unknown';
      const daysLeft = cc.gate_date ? Math.max(0, Math.ceil((new Date(cc.gate_date).getTime() - Date.now()) / 86400000)) : totalDays;
      const ccIcon = daysLeft <= 3 ? '🔴' : daysLeft <= 7 ? '🟡' : '📅';
      contentCalendarSection = `\n\n${ccIcon} *Content calendar:* ${totalVideos} vids assigned · ${daysLeft}d to gate (${gateDate})`;
    }
  } catch { /* skip */ }

  // Sprint 1156 (wave 35): achiri-dashboard.json total users + retention + today DAU
  let achiriDashboardSection = '';
  try {
    const adPath = path.join(ROOT, 'reports', 'achiri-dashboard.json');
    if (fs.existsSync(adPath)) {
      const ad = JSON.parse(fs.readFileSync(adPath, 'utf-8'));
      const overview = ad.overview ?? {};
      const totalUsers = overview.total_users ?? 0;
      const retention = overview.retention_pct ?? 0;
      const today = ad.today ?? {};
      const dau = today.dau ?? 0;
      const adIcon = retention >= 60 ? '✅' : retention >= 40 ? '🟡' : '⚠️';
      achiriDashboardSection = `\n\n${adIcon} *Achiri users:* ${totalUsers} total · ${retention}% retention · ${dau} DAU`;
    }
  } catch { /* skip */ }

  // Sprint 1157 (wave 36): achiri-readiness.json score + days to alpha
  let achiriReadinessSection = '';
  try {
    const arPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
    if (fs.existsSync(arPath)) {
      const ar = JSON.parse(fs.readFileSync(arPath, 'utf-8'));
      const arScore = ar.score ?? 0;
      const arDays = ar.days_to_alpha ?? 0;
      const checks: any[] = ar.checks ?? [];
      const passCount = checks.filter((c: any) => c.pass).length;
      const arIcon = arScore >= 80 ? '✅' : arScore >= 60 ? '🟡' : '⚠️';
      achiriReadinessSection = `\n\n${arIcon} *Achiri readiness:* ${arScore}/100 · ${passCount}/${checks.length} checks · ${arDays}d to alpha`;
    }
  } catch { /* skip */ }

  // Sprint 1157 (wave 36): viral-topics.json topics + trending count
  let viralTopicsSection = '';
  try {
    const vtPath = path.join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
    if (fs.existsSync(vtPath)) {
      const vt = JSON.parse(fs.readFileSync(vtPath, 'utf-8'));
      const topicsCount = (vt.topics ?? []).length;
      const trendingCount = (vt.trending ?? []).length;
      const vtAge = vt.updated_at ? (Date.now() - new Date(vt.updated_at).getTime()) / 3600000 : null;
      const vtAgeStr = vtAge != null && vtAge < 48 ? ` _(${Math.round(vtAge)}h ago)_` : '';
      const vtIcon = topicsCount >= 5 ? '🔥' : topicsCount > 0 ? '📡' : '⚪';
      viralTopicsSection = `\n\n${vtIcon} *Viral topics:* ${topicsCount} topics · ${trendingCount} trending${vtAgeStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1157 (wave 36): archived-videos.json count
  let archivedVideosSection = '';
  try {
    const avPath = path.join(ROOT, 'workspace', 'scs001', 'archived-videos.json');
    if (fs.existsSync(avPath)) {
      const av = JSON.parse(fs.readFileSync(avPath, 'utf-8'));
      const avCount = av.count ?? (av.ids ?? []).length;
      const avIcon = avCount > 50 ? '🗄️' : avCount > 10 ? '📦' : '✅';
      archivedVideosSection = `\n\n${avIcon} *Archived:* ${avCount} videos`;
    }
  } catch { /* skip */ }

  // Sprint 1158 (wave 37): manual-posts.jsonl posts today + last post time
  let manualPostsTodaySection = '';
  try {
    const mpPath = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    if (fs.existsSync(mpPath)) {
      const today = new Date().toISOString().slice(0, 10);
      const lines = fs.readFileSync(mpPath, 'utf-8').split('\n').filter(l => l.trim());
      const posts = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const todayPosts = posts.filter((p: any) => (p.posted_at ?? '').startsWith(today));
      const lastPost = posts.length > 0 ? posts[posts.length - 1] : null;
      const lastTime = lastPost?.posted_at ? lastPost.posted_at.replace('T', ' ').slice(0, 16) + ' UTC' : 'never';
      const mpIcon = todayPosts.length >= 2 ? '✅' : todayPosts.length === 1 ? '🟡' : '🔴';
      manualPostsTodaySection = `\n\n${mpIcon} *Posts today:* ${todayPosts.length} · Last: ${lastTime}`;
    }
  } catch { /* skip */ }

  // Sprint 1158 (wave 37): achiri-test-suite.json pass rate
  let achiriTestSuiteSection = '';
  try {
    const atsPath = path.join(ROOT, 'reports', 'achiri-test-suite.json');
    if (fs.existsSync(atsPath)) {
      const ats = JSON.parse(fs.readFileSync(atsPath, 'utf-8'));
      const passed = ats.passed ?? 0;
      const total = ats.total ?? 0;
      const failed = ats.failed ?? 0;
      const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
      const atsIcon = pct === 100 ? '✅' : pct >= 80 ? '🟡' : '🔴';
      achiriTestSuiteSection = `\n\n${atsIcon} *Achiri tests:* ${passed}/${total} pass (${pct}%)${failed > 0 ? ` · ${failed} failed` : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1158 (wave 37): crossplatform-publish.jsonl YouTube count today + total
  let crossplatformSection = '';
  try {
    const cpPath = path.join(ROOT, 'workspace', 'scs001', 'crossplatform-publish.jsonl');
    if (fs.existsSync(cpPath)) {
      const today = new Date().toISOString().slice(0, 10);
      const cpLines = fs.readFileSync(cpPath, 'utf-8').split('\n').filter(l => l.trim());
      const cpPosts = cpLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const ytPosts = cpPosts.filter((p: any) => p.platform === 'youtube' && p.success);
      const ytToday = ytPosts.filter((p: any) => (p.timestamp ?? '').startsWith(today));
      crossplatformSection = `\n\n📺 *YouTube Shorts:* ${ytToday.length} today · ${ytPosts.length} total`;
    }
  } catch { /* skip */ }

  // Sprint 1159 (wave 38): auto-delivered.jsonl delivered today + total
  let autoDeliveredTodaySection = '';
  try {
    const adPath = path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl');
    if (fs.existsSync(adPath)) {
      const today = new Date().toISOString().slice(0, 10);
      const adLines = fs.readFileSync(adPath, 'utf-8').split('\n').filter(l => l.trim());
      const adPosts = adLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const adToday = adPosts.filter((p: any) => (p.delivered_at ?? '').startsWith(today));
      const adIcon = adToday.length > 0 ? '📬' : '📭';
      autoDeliveredTodaySection = `\n\n${adIcon} *Auto-delivered:* ${adToday.length} today · ${adPosts.length} total`;
    }
  } catch { /* skip */ }

  // Sprint 1159 (wave 38): validation-errors.jsonl recent error count
  let validationErrorsSection = '';
  try {
    const vePath = path.join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl');
    if (fs.existsSync(vePath)) {
      const veLines = fs.readFileSync(vePath, 'utf-8').split('\n').filter(l => l.trim());
      const veTotal = veLines.length;
      const lastVe = veLines.length > 0 ? (() => { try { return JSON.parse(veLines[veLines.length - 1]); } catch { return null; } })() : null;
      const lastErrStr = lastVe?.errors?.[0] ? ` · last: ${String(lastVe.errors[0]).slice(0, 40)}` : '';
      const veIcon = veTotal === 0 ? '✅' : veTotal < 5 ? '🟡' : '⚠️';
      validationErrorsSection = `\n\n${veIcon} *Val errors:* ${veTotal}${lastErrStr}`;
    }
  } catch { /* skip */ }

  // Sprint 1159 (wave 38): telegram-sent.jsonl notifications today + total
  let telegramSentSection = '';
  try {
    const tsPath = path.join(ROOT, 'workspace', 'scs001', 'telegram-sent.jsonl');
    if (fs.existsSync(tsPath)) {
      const today = new Date().toISOString().slice(0, 10);
      const tsLines = fs.readFileSync(tsPath, 'utf-8').split('\n').filter(l => l.trim());
      const tsPosts = tsLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const tsToday = tsPosts.filter((p: any) => (p.sent_at ?? '').startsWith(today));
      telegramSentSection = `\n\n📱 *TG notifs:* ${tsToday.length} today · ${tsPosts.length} total`;
    }
  } catch { /* skip */ }

  return `${statusIcon} *Health* — \`${h.status}\`\n${beat}${beatStaleWarning}\nPhase: ${h.phase} | Day ${h.beta?.day_number ?? '?'}\n\n*Infra checks:*\n${checks}${pm2}${critDown}${botUptimeSection}${ollamaSection}${memWarnSection}${memTableSection}${supabaseSection}${supabaseSyncSection}${diskSection}${watchdogSection}${runtimeSection}${tailscaleSection}${hetznerSection}${anthropicSection}${ioSection}${morningBriefSection}${digestSection}${staleCronsSection}${supabaseDomainSection}${anthropicBudgetSection}${pipelineValidationSection}${worktreeSection}${botMemSection}${gateDaysSection}${backupSection}${postingHealthSection}${exportFilesSection}${tokenHealthSection}${statsSection}${inventorySection}${gateAuditSection}${autoDeliverSection}${bulkCaptionsSection}${playbackSection}${qcSection}${smokeSection}${achiriDauSection}${achiriE2eSection}${videoValidSection}${pipelineMetricsSection}${achiriSafetySection}${leaderboardSection}${brainxSection}${achiriLaunchSection}${postingScheduleSection}${phase15GateSection}${batchProduceSection}${revenueSummarySection}${contentDiversitySection}${costLogSection}${warmupSection}${abAnalysisSection}${prodQualitySection}${hookWeightsSection}${contentCalendarSection}${achiriDashboardSection}${achiriReadinessSection}${viralTopicsSection}${archivedVideosSection}${manualPostsTodaySection}${achiriTestSuiteSection}${crossplatformSection}${autoDeliveredTodaySection}${validationErrorsSection}${telegramSentSection}`;
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

  // Sprint 1122 (wave 12): Achiri test suite status
  let achiriTestLine = '';
  try {
    const testSuitePath = path.join(ROOT, 'reports', 'achiri-test-suite.json');
    if (fs.existsSync(testSuitePath)) {
      const ts = JSON.parse(fs.readFileSync(testSuitePath, 'utf-8'));
      const totalTests = ts.total ?? ts.tests?.length ?? 0;
      const passed = ts.passed ?? ts.pass ?? ts.tests?.filter((t: any) => t.pass || t.status === 'pass').length ?? 0;
      const failed = totalTests - passed;
      const pct = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;
      const icon = failed === 0 ? '✅' : failed <= 2 ? '⚠️' : '❌';
      achiriTestLine = `\n*Achiri Tests:* ${icon} ${passed}/${totalTests} pass (${pct}%)${failed > 0 ? ` · ${failed} failing` : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1143 (wave 17): days since last git commit
  let commitLine = '';
  try {
    const lastCommitTs = execSync('git log -1 --format=%ct 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 }).trim();
    if (lastCommitTs) {
      const ageH = (Date.now() - parseInt(lastCommitTs) * 1000) / 3600000;
      const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : ageH < 24 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
      const devIcon = ageH > 48 ? '⚠️' : '✅';
      const msg = execSync('git log -1 --format=%s 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 }).trim().slice(0, 60);
      commitLine = `\n*Last commit:* ${devIcon} ${ageStr} — ${msg}`;
    }
  } catch { /* skip */ }

  // Sprint 1144 (wave 19): total all-time commit count
  let totalCommitsLine = '';
  try {
    const totalCommits = execSync('git rev-list --count HEAD 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 }).trim();
    if (totalCommits) totalCommitsLine = `\n*All-time commits:* ${totalCommits}`;
  } catch { /* skip */ }

  // Sprint 1143 (wave 22): last 3 sprint titles shipped from git log
  let lastSprintsLine = '';
  try {
    const recentLog = execSync('git log --oneline -20 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 });
    const sprintTitles = recentLog.split('\n')
      .filter((l: string) => l.includes('Sprint '))
      .slice(0, 3)
      .map((l: string) => l.replace(/^[a-f0-9]+ /, '').slice(0, 60));
    if (sprintTitles.length > 0) {
      lastSprintsLine = `\n*Recent sprints:*\n${sprintTitles.map((s: string) => `  • ${s}`).join('\n')}`;
    }
  } catch { /* skip */ }

  // Sprint 1144 (wave 21): PM2 processes offline for >1h
  let offlineLine = '';
  try {
    const allProcs = getPm2List();
    const offlineLong = allProcs.filter(p => {
      if (p.status === 'online') return false;
      if (['telegram-bot', 'backend', 'openclaw-gateway'].includes(p.name)) return true;
      // For cron procs, only flag if offline and not recently restarted (>1h downtime is suspicious)
      return p.uptimeMs === 0 && p.status === 'stopped' && false; // skip crons — stopped is normal
    });
    if (offlineLong.length > 0) {
      offlineLine = `\n⚠️ *Offline critical processes:* ${offlineLong.map(p => `\`${p.name}\``).join(', ')}`;
    }
  } catch { /* skip */ }

  // Sprint 1144 (wave 20): validation errors from last pipeline run
  let valErrorsLine = '';
  try {
    const latestRunPath2 = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
    if (fs.existsSync(latestRunPath2)) {
      const run2 = JSON.parse(fs.readFileSync(latestRunPath2, 'utf-8'));
      const errCount2 = run2.validation_errors ?? run2.error_count ?? run2.errors?.length ?? 0;
      const icon2 = errCount2 === 0 ? '✅' : errCount2 <= 3 ? '⚠️' : '❌';
      valErrorsLine = `\n*Last run validation errors:* ${icon2} ${errCount2}`;
    }
  } catch { /* skip */ }

  // Sprint 1143 (wave 25): PM2 total restart count delta since last /report call
  let restartDeltaLine = '';
  try {
    const restartStatePath = path.join(ROOT, 'workspace', 'report-restart-count.json');
    const currentProcs = getPm2List();
    const currentRestarts = currentProcs.reduce((s, p) => s + p.restarts, 0);
    const nowMs25 = Date.now();
    if (fs.existsSync(restartStatePath)) {
      const prev25 = JSON.parse(fs.readFileSync(restartStatePath, 'utf-8'));
      const prevRestarts = prev25.count ?? 0;
      const prevTs25 = prev25.timestamp ?? 0;
      const ageH25 = (nowMs25 - prevTs25) / 3600000;
      const ageStr25 = ageH25 < 1 ? `${Math.round(ageH25 * 60)}m ago` : `${Math.round(ageH25)}h ago`;
      const delta25 = currentRestarts - prevRestarts;
      if (delta25 > 0) {
        restartDeltaLine = `\n⚠️ *PM2 restarts since last /report (${ageStr25}):* +${delta25}`;
      } else if (delta25 === 0) {
        restartDeltaLine = `\n✅ *PM2 restarts since last /report (${ageStr25}):* none`;
      }
    }
    fs.writeFileSync(restartStatePath, JSON.stringify({ count: currentRestarts, timestamp: nowMs25 }));
  } catch { /* skip */ }

  // Sprint 1142 (wave 24): daily brief freshness (age of daily-brief.md)
  let dailyBriefLine = '';
  try {
    const briefPath = path.join(ROOT, 'docs', 'daily-brief.md');
    if (fs.existsSync(briefPath)) {
      const stat = fs.statSync(briefPath);
      const ageH = (Date.now() - stat.mtimeMs) / 3600000;
      const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : ageH < 24 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
      const briefIcon = ageH <= 25 ? '✅' : '⚠️';
      dailyBriefLine = `\n*Daily brief:* ${briefIcon} updated ${ageStr}${ageH > 25 ? ' — stale, regenerate!' : ''}`;
    }
  } catch { /* skip */ }

  // Sprint 1143 (wave 23): Achiri alpha readiness alongside gate in system report
  let achiriReadinessReport = '';
  try {
    const arPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
    if (fs.existsSync(arPath)) {
      const arData = JSON.parse(fs.readFileSync(arPath, 'utf-8'));
      const arScore = arData.score ?? arData.readiness_score;
      const arDays = arData.days_to_alpha ?? Math.max(0, Math.ceil((new Date('2026-04-25T00:00:00Z').getTime() - Date.now()) / 86_400_000));
      if (arScore != null) {
        const arIcon = arScore >= 90 ? '✅' : arScore >= 70 ? '⚠️' : '❌';
        achiriReadinessReport = `\n*Achiri:* ${arIcon} ${arScore}% ready · ${arDays}d to alpha`;
      }
    }
  } catch { /* skip */ }

  // Sprint 1143 (wave 26): show Godman npm publish status per package in /report
  let godmanNpmReportLine = '';
  try {
    const godmanPkgs26 = ['@godman/pact', '@godman/amf', '@godman/signal', '@godman/soul', '@godman/score', '@godman/lax', '@godman/drs', '@godman/sdk'];
    const pkgResults: string[] = [];
    for (const pkg of godmanPkgs26) {
      try {
        const ver = execSync(`npm view ${pkg} version 2>/dev/null`, { timeout: 5000, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim();
        pkgResults.push(`✅ \`${pkg.replace('@godman/', '')}\`@${ver}`);
      } catch {
        pkgResults.push(`❌ \`${pkg.replace('@godman/', '')}\``);
      }
    }
    const pubCount = pkgResults.filter(r => r.startsWith('✅')).length;
    godmanNpmReportLine = `\n*Godman npm (${pubCount}/${godmanPkgs26.length}):* ${pkgResults.join(' · ')}`;
  } catch { /* skip */ }

  // Sprint 1147 (wave 27): cost efficiency from stats-latest.json
  let costEfficiencyLine = '';
  try {
    const statsPath27 = path.join(ROOT, 'reports', 'stats-latest.json');
    if (fs.existsSync(statsPath27)) {
      const st27 = JSON.parse(fs.readFileSync(statsPath27, 'utf-8'));
      const totalCost = st27.costs?.total_usd;
      const avgCost = st27.costs?.avg_per_video_usd;
      if (totalCost != null) {
        const avgStr = avgCost != null ? ` · $${avgCost.toFixed(4)}/video` : '';
        costEfficiencyLine = `\n*Cost:* $${totalCost.toFixed(2)} total${avgStr}`;
      }
    }
  } catch { /* skip */ }

  return (
    `${statusIcon} *Kognai System Report*\n${now}\n${alertBlock}\n` +
    `*PM2* (${online}/${procs.length} live):\n${pm2Lines || '  (no data)'}\n\n` +
    `*Status:* \`${healthStatus}\` | Phase: ${phase} | Day ${day}\n` +
    `Last heartbeat: ${lastBeat} UTC\n\n` +
    `*Beta:* agents_onboarded=${beta.agents_onboarded ?? 0}, companies=${beta.companies_onboarded ?? 0}, txns=${beta.transactions_monitored ?? 0}\n` +
    `*Financials:* MRR $${mrr} | Tier: ${tier} | Billing activation: ${billingDate}\n\n` +
    `*Gate:* ${gateLine}${achiriTestLine}${achiriReadinessReport}${dailyBriefLine}${restartDeltaLine}${commitLine}${totalCommitsLine}${valErrorsLine}${offlineLine}${lastSprintsLine}\n` +
    `*Sprint:* ${sprintLine}${godmanNpmReportLine}${costEfficiencyLine}`
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

    // Sprint 1114: highlight stuck jobs (>48h since last fire)
    const stuck = crons.filter(c => c.ageHours > 48 && c.status === 'online');
    if (stuck.length > 0) {
      lines.push(`🔴 *Stuck (>48h):*`);
      for (const c of stuck) {
        lines.push(`  🔴 \`${c.name}\` — ${Math.round(c.ageHours)}h since last restart · \`pm2 restart ${c.name}\``);
        // Sprint 1124: last log snippet from stuck cron
        try {
          const logPath = path.join(ROOT, 'logs', `${c.name}-error.log`);
          if (fs.existsSync(logPath)) {
            const logLines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(l => l.trim());
            const lastLine = logLines[logLines.length - 1] ?? '';
            if (lastLine) lines.push(`    _"${lastLine.slice(0, 80)}"_`);
          }
        } catch {}
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
// Sprint 1129: added optional filterProcess arg
export function cmdErrors(filterProcess?: string): string {
  const logDir = path.join(ROOT, 'logs');
  const cutoff = Date.now() - 86_400_000; // 24h ago
  const yesterdayCutoff = Date.now() - 172_800_000; // 48h ago (for trend)

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

  // Sprint 1129: filter by process name if provided
  const allErrors = Array.from(dedupMap.values());
  const errored = (filterProcess
    ? allErrors.filter(e => e.name.toLowerCase().includes(filterProcess.toLowerCase()))
    : allErrors
  ).sort((a, b) => b.mtime - a.mtime);
  const output: string[] = [];
  if (filterProcess) output.push(`🔍 *Filtered by:* \`${filterProcess}\`\n`);
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
    // Sprint 1122: show total occurrence count alongside unique count
    const totalOccurrences = errored.reduce((s, e) => s + (e.count ?? 1), 0);
    const countStr = totalOccurrences > errored.length ? `${totalOccurrences} total, ${errored.length} unique` : `${errored.length} unique`;

    // Sprint 1134 (wave 13): error trend vs yesterday
    let trendStr = '';
    try {
      const logFiles = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
      let yesterdayCount = 0;
      for (const file of logFiles) {
        const fullPath = path.join(logDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0 || stat.mtimeMs < yesterdayCutoff) continue;
          const content = fs.readFileSync(fullPath, 'utf-8').trim();
          if (!content) continue;
          const lines24h = content.split('\n').filter((l: string) => l.trim() &&
            (l.toLowerCase().includes('error') || l.toLowerCase().includes('fatal') ||
             l.toLowerCase().includes('exception') || l.toLowerCase().includes('fail')));
          yesterdayCount += lines24h.length;
        } catch { /* skip */ }
      }
      const todayCount = totalOccurrences;
      const diff = todayCount - Math.max(1, yesterdayCount / 2); // compare yesterday's 24h slice
      if (Math.abs(diff) > 2) {
        const trendIcon = diff > 0 ? '📈' : '📉';
        trendStr = ` · ${trendIcon} ${diff > 0 ? '+' : ''}${Math.round(diff)} vs yesterday`;
      }
    } catch { /* skip */ }

    // Sprint 1142 (wave 17): unique processes affected
    const uniqueProcs = new Set(errored.map(e => e.name)).size;
    const procsStr = ` · ${uniqueProcs} process${uniqueProcs !== 1 ? 'es' : ''} affected`;
    output.push(`⚠️ *PM2 Errors (last 24h)* — ${countStr}${trendStr}${procsStr} · _${windowStr}_\n`);

    // Sprint 1111: group by error type, show top 3
    const typeCounts = new Map<string, number>();
    for (const e of errored) {
      const lower = e.line.toLowerCase();
      let etype = 'other';
      if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) etype = 'timeout';
      else if (lower.includes('enoent') || lower.includes('not found') || lower.includes('no such file')) etype = 'file-not-found';
      else if (lower.includes('parse') || lower.includes('json') || lower.includes('syntax')) etype = 'parse-error';
      else if (lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('socket')) etype = 'connection';
      else if (lower.includes('permission') || lower.includes('eacces')) etype = 'permission';
      else if (lower.includes('memory') || lower.includes('heap') || lower.includes('oom')) etype = 'memory';
      typeCounts.set(etype, (typeCounts.get(etype) ?? 0) + e.count);
    }
    const topTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topTypes.length > 0) {
      output.push(`*Top types:* ${topTypes.map(([t, c]) => `${t} (${c})`).join(' · ')}\n`);
    }

    // Sprint 1122: top error source by process name
    const processCounts = new Map<string, number>();
    for (const e of errored) processCounts.set(e.name, (processCounts.get(e.name) ?? 0) + e.count);
    const topProcess = Array.from(processCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topProcess) {
      output.push(`*Top source:* \`${topProcess[0]}\` (${topProcess[1]} error${topProcess[1] > 1 ? 's' : ''})\n`);
    }

    // Sprint 1143 (wave 19): most common error string (top recurring line)
    const topByCount = [...errored].sort((a, b) => b.count - a.count);
    if (topByCount.length > 0 && topByCount[0].count > 1) {
      output.push(`*Top recurring:* \`${topByCount[0].line.slice(0, 80)}\` ×${topByCount[0].count}\n`);
    }

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

  // Sprint 1140 (wave 15): top 3 log files by size
  try {
    const logFiles = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
    const withSizes = logFiles.map((f: string) => {
      try { return { name: f, size: fs.statSync(path.join(logDir, f)).size }; } catch { return { name: f, size: 0 }; }
    }).sort((a, b) => b.size - a.size).slice(0, 3).filter(f => f.size > 1024);
    if (withSizes.length > 0) {
      const sizeLines = withSizes.map(f => {
        const kb = Math.round(f.size / 1024);
        return `  \`${f.name.replace('-error.log', '')}\` ${kb}KB`;
      }).join('\n');
      output.push(`\n*Largest error logs:*\n${sizeLines}`);
    }
  } catch { /* skip */ }

  // Sprint 1140 (wave 16): auto-suggest /boot if critical crons are missing from PM2
  try {
    const criticalCrons = ['scs001-morning-brief', 'scs001-watchdog', 'scs001-pipeline'];
    const procs = getPm2List();
    const pm2Names = procs.map(p => p.name);
    const missingCrons = criticalCrons.filter(c => !pm2Names.some(n => n.includes(c)));
    if (missingCrons.length > 0) {
      output.push(`\n⚠️ *Critical crons missing from PM2:* ${missingCrons.map(c => `\`${c}\``).join(', ')}\n_Run /boot to restore them_`);
    }
  } catch { /* skip */ }

  // Sprint 1141 (wave 18): "new today" badge on error logs created since midnight
  try {
    const midnightMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const logFiles2 = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
    const newToday = logFiles2.filter((f: string) => {
      try { const stat = fs.statSync(path.join(logDir, f)); return stat.birthtimeMs >= midnightMs || stat.ctimeMs >= midnightMs; } catch { return false; }
    });
    if (newToday.length > 0) {
      output.push(`\n🆕 *New today:* ${newToday.map((f: string) => `\`${f.replace('-error.log', '')}\``).join(', ')}`);
    }
  } catch { /* skip */ }

  // Sprint 1137 (wave 14): weekly error count delta vs last week
  try {
    const logFiles = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
    const weekCutoff = Date.now() - 7 * 86_400_000;
    const twoWeekCutoff = Date.now() - 14 * 86_400_000;
    let thisWeekErrors = 0, lastWeekErrors = 0;
    for (const file of logFiles) {
      const fullPath = path.join(logDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < twoWeekCutoff) continue;
        const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
        for (const l of lines) {
          const lower = l.toLowerCase();
          if (!(lower.includes('error') || lower.includes('fatal') || lower.includes('exception') || lower.includes('fail'))) continue;
          if (stat.mtimeMs >= weekCutoff) thisWeekErrors++;
          else lastWeekErrors++;
        }
      } catch { /* skip */ }
    }
    const delta = thisWeekErrors - lastWeekErrors;
    const trendIcon = delta > 5 ? '📈 worse' : delta < -5 ? '📉 better' : '➡️ stable';
    const deltaStr = delta > 0 ? `+${delta}` : String(delta);
    output.push(`\n*Weekly:* ${thisWeekErrors} this week vs ${lastWeekErrors} last week (${deltaStr} · ${trendIcon})`);
  } catch { /* skip */ }

  // Sprint 1139 (wave 21): show processes with >5 restarts today
  try {
    const pm2Out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    const pm2Procs2: any[] = JSON.parse(pm2Out);
    const todayStartMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const highRestartToday = pm2Procs2.filter((p: any) => {
      if (!p.pm2_env) return false;
      const uptime = p.pm2_env.pm_uptime ?? p.pm2_env.created_at ?? 0;
      const restarts = p.pm2_env.restart_time ?? 0;
      // Process started (or restarted) within today: compare restarts to threshold
      if (uptime >= todayStartMs && restarts > 5) return true;
      return false;
    });
    if (highRestartToday.length > 0) {
      const list = highRestartToday.map((p: any) => `\`${p.name}\` (${p.pm2_env.restart_time} restarts)`).join(', ');
      output.push(`\n⚠️ *High restarts today (>5):* ${list}`);
    }
  } catch { /* skip */ }

  // Sprint 1142 (wave 20): warn if any error log file exceeds 1MB (disk health signal)
  try {
    const allLogs = fs.readdirSync(logDir).filter((f: string) => f.endsWith('-error.log'));
    const largeLogs = allLogs.map((f: string) => {
      try { const s = fs.statSync(path.join(logDir, f)); return { name: f, size: s.size }; } catch { return { name: f, size: 0 }; }
    }).filter(l => l.size >= 1024 * 1024).sort((a, b) => b.size - a.size);
    if (largeLogs.length > 0) {
      const logList = largeLogs.map(l => `\`${l.name.replace('-error.log', '')}\` ${(l.size / (1024 * 1024)).toFixed(1)}MB`).join(', ');
      output.push(`\n⚠️ *Large error logs (≥1MB):* ${logList} — consider rotating`);
    }
  } catch { /* skip */ }

  // Sprint 1139 (wave 22): error count delta since last /errors call
  try {
    const deltaPath = path.join(ROOT, 'workspace', 'errors-last-count.json');
    const currentCount = errored.reduce((s, e) => s + (e.count ?? 1), 0);
    const nowMs = Date.now();
    if (fs.existsSync(deltaPath)) {
      const prev = JSON.parse(fs.readFileSync(deltaPath, 'utf-8'));
      const prevCount = prev.count ?? 0;
      const prevTs = prev.timestamp ?? 0;
      const ageH = (nowMs - prevTs) / 3600000;
      const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : `${Math.round(ageH)}h ago`;
      const delta = currentCount - prevCount;
      if (delta !== 0) {
        const deltaIcon = delta > 0 ? '📈' : '📉';
        const deltaStr = delta > 0 ? `+${delta}` : String(delta);
        output.push(`\n${deltaIcon} *Delta since last check (${ageStr}):* ${deltaStr} errors`);
      }
    }
    fs.writeFileSync(deltaPath, JSON.stringify({ count: currentCount, timestamp: nowMs }));
  } catch { /* skip */ }

  // Sprint 1139 (wave 25): show top 3 error lines by occurrence count (most spammy)
  try {
    const topByCount25 = [...errored].sort((a, b) => b.count - a.count).slice(0, 3).filter(e => e.count >= 3);
    if (topByCount25.length > 0) {
      output.push(`\n*Most repeated errors:*`);
      for (const e of topByCount25) {
        output.push(`  ×${e.count} \`${e.line.slice(0, 70)}\` (${e.name})`);
      }
    }
  } catch { /* skip */ }

  // Sprint 1139 (wave 23): show if error rate is accelerating (hourly rate > daily avg)
  try {
    const totalOccurrences2 = errored.reduce((s, e) => s + (e.count ?? 1), 0);
    if (totalOccurrences2 > 0) {
      const dailyAvgPerHour = totalOccurrences2 / 24;
      // Recent errors: look for errors in the last hour (mtime within last hour)
      const oneHourAgo = Date.now() - 3_600_000;
      const recentErrors = errored.filter(e => e.mtime >= oneHourAgo);
      const recentCount = recentErrors.reduce((s, e) => s + (e.count ?? 1), 0);
      if (recentCount > dailyAvgPerHour * 1.5 && recentCount >= 3) {
        output.push(`\n🚨 *Rate accelerating:* ${recentCount} errors in last hour vs ${dailyAvgPerHour.toFixed(1)}/hr daily avg`);
      }
    }
  } catch { /* skip */ }

  // Sprint 1139 (wave 26): show processes with zero errors today (all-clear list)
  try {
    const pm2Procs26 = getPm2List();
    const erroredNames = new Set(errored.map((e: any) => (e.file ?? '').replace('-error.log', '').replace('-out.log', '')));
    const clearProcs = pm2Procs26
      .filter((p: any) => p.status === 'online')
      .filter((p: any) => !Array.from(erroredNames).some((n: string) => (p.name ?? '').includes(n) || n.includes(p.name ?? '')))
      .map((p: any) => `\`${p.name}\``);
    if (clearProcs.length > 0) {
      output.push(`\n✅ *All-clear:* ${clearProcs.slice(0, 6).join(', ')}${clearProcs.length > 6 ? ` +${clearProcs.length - 6} more` : ''}`);
    }
  } catch { /* skip */ }

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
    // Sprint 1140 (wave 20): track timing per check
    const checkTimings: Array<{name: string; ms: number}> = [];
    const t0 = Date.now();
    const output: string = await new Promise((resolve, reject) => {
      exec(
        'npx ts-node --transpile-only scripts/scs001/validate-full-pipeline.ts',
        { cwd: ROOT, timeout: 240000, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
        (err: any, stdout: string, stderr: string) => {
          checkTimings.push({ name: 'validate-pipeline', ms: Date.now() - t0 });
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

    // Sprint 1126: list failed tests by name, then passing summary
    const failLines: string[] = [];
    const passLines: string[] = [];
    for (const line of output.split('\n')) {
      const t = line.trim();
      if (t.includes('✗') || t.match(/^\s*(FAIL|✗|×|\d+\))/)) failLines.push(t.slice(0, 80));
      else if (t.includes('✓') || t.match(/^\s*(PASS|✓|passing)/)) passLines.push(t.slice(0, 80));
    }
    if (failLines.length > 0) {
      lines.push('*Failed:*');
      for (const l of failLines.slice(0, 5)) lines.push(`  ${l}`);
    }
    if (passLines.length > 0) {
      lines.push('*Passed:*');
      for (const l of passLines.slice(0, 5)) lines.push(`  ${l}`);
    }

    // Sprint 1122: pipeline validator check
    const validatorPath = path.join(ROOT, 'reports', 'pipeline-validator-latest.json');
    if (fs.existsSync(validatorPath)) {
      try {
        const vr = JSON.parse(fs.readFileSync(validatorPath, 'utf-8'));
        const errCount = vr.errors?.length ?? vr.error_count ?? 0;
        lines.push('');
        lines.push(errCount === 0
          ? `✅ Pipeline validator: 0 errors`
          : `❌ Pipeline validator: ${errCount} errors — /errors for details`);
      } catch {}
    }

    // Sprint 1136 (wave 16): save smoke result + Sprint 1139 (wave 19): rolling 7-run history
    let smokeHistory: Array<{pass: boolean; timestamp: string}> = [];
    try {
      const smokePath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
      if (fs.existsSync(smokePath)) {
        const prev = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
        if (Array.isArray(prev.history)) smokeHistory = prev.history;
      }
    } catch { /* skip */ }
    try {
      const smokeResult = {
        timestamp: new Date().toISOString(),
        passed: passed,
        failed: failed,
        status: failed === 0 ? 'pass' : 'fail',
        pass: failed === 0,
        history: [...smokeHistory, { pass: failed === 0, timestamp: new Date().toISOString() }].slice(-7),
      };
      fs.writeFileSync(path.join(ROOT, 'reports', 'smoke-test-latest.json'), JSON.stringify(smokeResult, null, 2));
    } catch { /* skip — non-critical */ }
    // Sprint 1139 (wave 19): show 7-run pass rate
    const updatedHistory = [...smokeHistory, { pass: failed === 0 }];
    const last7Smoke = updatedHistory.slice(-7);
    if (last7Smoke.length >= 2) {
      const passCount7 = last7Smoke.filter((h: any) => h.pass).length;
      const rate7 = Math.round((passCount7 / last7Smoke.length) * 100);
      const rateIcon = rate7 >= 80 ? '✅' : rate7 >= 50 ? '⚠️' : '❌';
      lines.push('');
      lines.push(`${rateIcon} *7-run pass rate:* ${rate7}% (${passCount7}/${last7Smoke.length})`);
    }

    // Sprint 1134 (wave 14): Telegram bot ping check
    try {
      const tgPingStart = Date.now();
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        const getMeUrl = `https://api.telegram.org/bot${token}/getMe`;
        const res = await new Promise<{ ok: boolean; username?: string }>((resolve) => {
          const https = require('https');
          https.get(getMeUrl, (r: any) => {
            let body = '';
            r.on('data', (d: any) => { body += d; });
            r.on('end', () => {
              try { const j = JSON.parse(body); resolve({ ok: j.ok, username: j.result?.username }); } catch { resolve({ ok: false }); }
            });
          }).on('error', () => resolve({ ok: false }));
        });
        checkTimings.push({ name: 'tg-ping', ms: Date.now() - tgPingStart });
        lines.push('');
        lines.push(res.ok ? `✅ Telegram bot: @${res.username ?? '?'} reachable` : `❌ Telegram bot: token invalid or unreachable`);
      } else {
        lines.push('');
        lines.push(`⚠️ Telegram bot: TELEGRAM_BOT_TOKEN not set`);
      }
    } catch { /* skip */ }

    // Sprint 1141 (wave 17): check that morning-brief PM2 cron exists
    try {
      const pm2Procs = getPm2List();
      const hasMorningBrief = pm2Procs.some(p => p.name === 'scs001-morning-brief');
      lines.push('');
      lines.push(hasMorningBrief
        ? `✅ Morning brief cron: registered in PM2`
        : `⚠️ Morning brief cron: *missing from PM2* — run \`pm2 start ecosystem.config.js --only scs001-morning-brief\``);
    } catch { /* skip */ }

    // Sprint 1140 (wave 20): show slowest check
    if (checkTimings.length >= 2) {
      const slowest = [...checkTimings].sort((a, b) => b.ms - a.ms)[0];
      const slowSec = (slowest.ms / 1000).toFixed(1);
      lines.push('');
      lines.push(`⏱ *Slowest check:* \`${slowest.name}\` — ${slowSec}s`);
    }

    // Sprint 1142 (wave 22): TikTok token validity check
    try {
      const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN;
      const tiktokKey = process.env.TIKTOK_CLIENT_KEY;
      lines.push('');
      if (!tiktokToken) {
        lines.push(`❌ *TikTok token:* TIKTOK_ACCESS_TOKEN not set — posting blocked`);
      } else {
        const isPlausible = tiktokToken.length >= 16;
        lines.push(isPlausible
          ? `✅ *TikTok token:* set (\`${tiktokToken.slice(0, 8)}...\`)${tiktokKey ? '' : ' · CLIENT_KEY missing'}`
          : `⚠️ *TikTok token:* set but suspiciously short (${tiktokToken.length} chars) — may be invalid`);
      }
    } catch { /* skip */ }

    // Sprint 1142 (wave 25): show number of captioned MP4s ready for posting
    try {
      const scsDir = path.join(ROOT, 'workspace', 'scs001');
      let captionedCount = 0;
      if (fs.existsSync(scsDir)) {
        const runDirs = fs.readdirSync(scsDir).filter((d: string) => d.startsWith('run-'));
        for (const dir of runDirs) {
          const captionDir = path.join(scsDir, dir, 'caption');
          if (fs.existsSync(captionDir)) {
            captionedCount += fs.readdirSync(captionDir).filter((f: string) => f.endsWith('-captioned.mp4')).length;
          }
        }
      }
      const capIcon = captionedCount > 5 ? '✅' : captionedCount > 0 ? '⚠️' : '❌';
      lines.push('');
      lines.push(`${capIcon} *Captioned MP4s ready:* ${captionedCount}`);
    } catch { /* skip */ }

    // Sprint 1141 (wave 24): show last pipeline run timestamp and status inline
    try {
      const latestRunPath2 = path.join(ROOT, 'reports', 'pipeline-runs', 'latest.json');
      if (fs.existsSync(latestRunPath2)) {
        const runData2 = JSON.parse(fs.readFileSync(latestRunPath2, 'utf-8'));
        const runTs2 = runData2.completed_at ?? runData2.started_at ?? runData2.timestamp;
        if (runTs2) {
          const ageH2 = (Date.now() - new Date(runTs2).getTime()) / 3600000;
          const ageStr2 = ageH2 < 1 ? `${Math.round(ageH2 * 60)}m ago` : `${Math.round(ageH2)}h ago`;
          const runStatus2 = runData2.status ?? (runData2.failed === 0 ? 'pass' : 'fail');
          const runIcon2 = runStatus2 === 'pass' && ageH2 <= 24 ? '✅' : ageH2 > 24 ? '⚠️' : '❌';
          lines.push('');
          lines.push(`${runIcon2} *Last pipeline run:* ${ageStr2} · ${runStatus2}${ageH2 > 24 ? ' — stale!' : ''}`);
        }
      }
    } catch { /* skip */ }

    // Sprint 1142 (wave 23): env var completeness score (N/M required vars set)
    try {
      const requiredEnvVars = [
        'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
        'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
        'TIKTOK_ACCESS_TOKEN', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET',
      ];
      const setCount = requiredEnvVars.filter(k => !!process.env[k]).length;
      const total = requiredEnvVars.length;
      const envPct = Math.round((setCount / total) * 100);
      const envIcon = setCount === total ? '✅' : setCount >= Math.ceil(total * 0.7) ? '⚠️' : '❌';
      const missingVars = requiredEnvVars.filter(k => !process.env[k]);
      lines.push('');
      lines.push(`${envIcon} *Env vars:* ${setCount}/${total} set (${envPct}%)${missingVars.length > 0 ? ` · missing: ${missingVars.map(v => `\`${v}\``).join(', ')}` : ''}`);
    } catch { /* skip */ }

    // Sprint 1142 (wave 26): compare runtime with previous smoke run (performance trend)
    try {
      const smokeRuntimePath = path.join(ROOT, 'workspace', 'smoke-runtime-prev.json');
      const currentMs = Date.now() - t0;
      if (fs.existsSync(smokeRuntimePath)) {
        const prevRun = JSON.parse(fs.readFileSync(smokeRuntimePath, 'utf-8'));
        const prevMs = prevRun.ms ?? 0;
        if (prevMs > 0) {
          const delta = currentMs - prevMs;
          const pctChange = ((delta / prevMs) * 100).toFixed(0);
          const trendIcon = delta > 5000 ? '🔴' : delta > 2000 ? '⚠️' : delta < -2000 ? '✅' : '🟢';
          const trendStr = delta > 0 ? `+${(delta / 1000).toFixed(1)}s (+${pctChange}%)` : `${(delta / 1000).toFixed(1)}s (${pctChange}%)`;
          lines.push('');
          lines.push(`${trendIcon} *Runtime vs prev:* ${trendStr} (prev: ${(prevMs / 1000).toFixed(1)}s)`);
        }
      }
      fs.writeFileSync(smokeRuntimePath, JSON.stringify({ ms: currentMs, timestamp: new Date().toISOString() }));
    } catch { /* skip */ }

    // Sprint 1142 (wave 21): show total elapsed time
    const totalElapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    lines.push(`⏱ *Total runtime:* ${totalElapsedSec}s`);

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

  // Sprint 1162: compute countdown before header so it appears in the title line
  const LAUNCH = new Date('2026-04-14T00:00:00Z');
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((LAUNCH.getTime() - now.getTime()) / 86_400_000));
  const lines: string[] = [`*Godman Protocols — 🚀 ${daysLeft}d to launch (Apr 14)*\n`];

  lines.push(`📅 *Launch: April 14* — ${daysLeft} days remaining\n`);

  // Protocol status
  let allOk = true;
  const noTestScript: string[] = []; // Sprint 1163: track missing test scripts
  for (const proto of PROTOCOLS) {
    const pkgPath = path.join(BASE, proto, 'package.json');
    const distPath = path.join(BASE, proto, 'dist');
    let version = '?';
    let hasDist = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      version = pkg.version || '?';
      if (!pkg.scripts?.test) noTestScript.push(proto); // Sprint 1163
    } catch { noTestScript.push(proto); } // Sprint 1163: no package.json = no test
    try { hasDist = fs.existsSync(distPath) && fs.readdirSync(distPath).length > 0; } catch {}
    const icon = hasDist ? '✅' : '⚠️';
    if (!hasDist) allOk = false;
    lines.push(`${icon} \`@godman-protocols/${proto}\` v${version}${hasDist ? ' — built' : ' — needs build'}`);
  }
  // Sprint 1163: warn about protocols missing test scripts
  if (noTestScript.length > 0) {
    lines.push(`\n⚠️ *No test script:* ${noTestScript.join(', ')} — add npm test before launch`);
  } else {
    lines.push('\n✅ All protocols have test scripts');
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

  // Sprint 1119: warn if any protocol is missing test script
  const missingTests = PROTOCOLS.concat(['sdk']).filter(p => {
    const pkgPath = path.join(BASE, p, 'package.json');
    if (!fs.existsSync(pkgPath)) return true;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return !pkg.scripts?.test;
    } catch { return true; }
  });
  if (missingTests.length === 0) {
    lines.push(`🧪 Tests: ✅ all 8 packages have test scripts`);
  } else {
    lines.push(`🧪 Tests: ⚠️ missing test script in: ${missingTests.join(', ')}`);
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

  // Sprint 1136 (wave 18): git tag status per protocol
  try {
    const tags = execSync('git tag 2>/dev/null', { cwd: ROOT, encoding: 'utf-8', timeout: 5000, stdio: ['pipe','pipe','pipe'] }).trim().split('\n').filter(Boolean);
    const taggedProtos = new Set(PROTOCOLS.filter(p => tags.some(t => t.includes(p))));
    lines.push('');
    lines.push('*Git tags:*');
    for (const proto of PROTOCOLS.concat(['sdk'])) {
      const tagged = taggedProtos.has(proto) || tags.some(t => t.includes(proto));
      lines.push(`  ${tagged ? '✅' : '❌'} ${proto} — ${tagged ? 'tagged' : 'no tag yet'}`);
    }
  } catch { /* skip */ }

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
