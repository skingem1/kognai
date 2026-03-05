/**
 * Heartbeat Daemon — Conway Governance Layer
 *
 * Runs every 6 hours via PM2 cron.
 * Monitors: MRR, agent health, API status, gas reserves, beta metrics.
 * Also: PM2 cron service watchdog — detects stale/crashed services.
 * Writes state to health.json and tier.json.
 * Appends alerts to audit.log.
 * Sends Telegram alerts for any anomaly.
 *
 * @version 2.1.0 — Service Watchdog Edition
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');
const HEALTH_FILE = path.join(ROOT, 'health.json');
const TIER_FILE = path.join(ROOT, 'tier.json');
const AUDIT_LOG = path.join(ROOT, 'audit.log');
const LOGS_DIR = path.join(ROOT, 'logs');

// ─── PM2 Cron Service Registry ───────────────────────────────────────
// Maps PM2 service name → { logFile, staleAfterHours, donePattern }
// staleAfterHours: how long before we consider the service overdue
const CRON_SERVICES: Array<{
  name: string;
  outLog: string;
  staleAfterHours: number;  // alert if no success in this many hours
  donePattern: RegExp;      // regex to detect a successful run in the out log
}> = [
  {
    name: 'cto-email-support',
    outLog: path.join(LOGS_DIR, 'email-support-out.log'),
    staleAfterHours: 1,  // runs every 5min; alert if silent for 1h
    donePattern: /No new emails|Replied to|email processed/i,
  },
  {
    name: 'cto-daily-scan',
    outLog: path.join(LOGS_DIR, 'cto-scan-out.log'),
    staleAfterHours: 30,  // runs daily 9 UTC; alert if silent for 30h
    donePattern: /Report:|full-scan-\d{4}/i,
  },
  {
    name: 'x-admin-post',
    outLog: path.join(LOGS_DIR, 'x-admin-out.log'),
    staleAfterHours: 2,  // runs every 30min; alert if silent for 2h
    donePattern: /Done\.|posted|rejected/i,
  },
  {
    name: 'cmo-daily-watch',
    outLog: path.join(LOGS_DIR, 'cmo-watch-out.log'),
    staleAfterHours: 30,  // runs daily 8 UTC; alert if silent for 30h
    donePattern: /Report:|market-watch-\d{4}/i,
  },
  {
    name: 'tax-watchdog-us',
    outLog: path.join(LOGS_DIR, 'tax-us-out.log'),
    staleAfterHours: 200,  // runs Monday 7 UTC; alert if silent for 8+ days
    donePattern: /Done\. New entries:/i,
  },
  {
    name: 'tax-watchdog-eu-japan',
    outLog: path.join(LOGS_DIR, 'tax-eu-japan-out.log'),
    staleAfterHours: 200,  // runs Monday 8 UTC; alert if silent for 8+ days
    donePattern: /Done\. New:/i,
  },
];

// ─── Types ───────────────────────────────────────────────────────────

interface Pm2ProcessInfo {
  name: string;
  status: string;   // 'online' | 'stopped' | 'errored' | 'launching' | 'stopping'
  restarts: number;
  uptimeMs: number | null;
  pid: number | null;
  memory: number | null; // bytes
  cpu: number | null;    // percent
}

interface HealthState {
  last_heartbeat: string;
  status: 'healthy' | 'degraded' | 'critical' | 'dead';
  phase: 'pre_launch' | 'beta_month_1' | 'beta_month_2' | 'live';
  uptime_seconds: number;
  checks: {
    api_status: string;
    database_status: string;
    edge_function_status: string;
    dashboard_status: string;
    website_status: string;
  };
  pm2: {
    total: number;
    online: number;
    stopped: number;
    errored: number;
    critical_down: string[];   // names of CRITICAL_PM2_PROCESSES that are not 'online'
    processes: Pm2ProcessInfo[];
  };
  agents: {
    total_configured: number; // YAML config files on disk — NOT running processes
    // (total_active removed: it was always equal to total_configured and caused CEO hallucination)
    agents: Record<string, { status: string; model: string; last_session: string | null }>;
  };
  financials: {
    mrr: number;
    monthly_budget: number;
    monthly_spend: number;
    gas_reserve_sol: number;
    credit_balance_usd: number;
  };
  beta: {
    start_date: string;
    day_number: number;
    agents_onboarded: number;
    companies_onboarded: number;
    api_integrations_live: number;
    transactions_monitored: number;
    founding_agent_badges: number;
    early_adopter_badges: number;
  };
}

interface TierState {
  current_tier: string;
  mrr: number;
  mrr_currency: string;
  last_updated: string;
  beta_start_date: string;
  billing_activation_date: string;
  day_number: number;
  tiers: Record<string, { mrr_threshold: number; agents_active: number; description: string }>;
  history: Array<{ date: string; tier: string; mrr: number; event: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function readJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJSON(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function appendAudit(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [HEARTBEAT] ${message}\n`;
  fs.appendFileSync(AUDIT_LOG, line);
}

// ─── Telegram Alert ──────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // silently skip if not configured
  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  return new Promise(resolve => {
    const req = https.request(
      { hostname: 'api.telegram.org', path: `/bot${token}/sendMessage`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      () => resolve()
    );
    req.on('error', () => resolve()); // never throw — alerting must not crash heartbeat
    req.write(body);
    req.end();
  });
}

// ─── PM2 Cron Service Watchdog ───────────────────────────────────────

interface ServiceHealth {
  name: string;
  status: 'ok' | 'stale' | 'no_log';
  lastSuccessAt: string | null;  // ISO timestamp of last matching line
  hoursAgo: number | null;
  staleThresholdHours: number;
}

function getLastSuccessTimestamp(logFile: string, pattern: RegExp): Date | null {
  if (!fs.existsSync(logFile)) return null;
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').reverse(); // most recent first
    for (const line of lines) {
      if (!pattern.test(line)) continue;
      // PM2 out log format: "2026-03-01 08:06:12 +00:00: ..."
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) [+-]\d{2}:\d{2}/);
      if (tsMatch) return new Date(tsMatch[1].replace(' ', 'T') + 'Z');
    }
  } catch {}
  return null;
}

function checkCronServices(): ServiceHealth[] {
  const now = Date.now();
  return CRON_SERVICES.map(svc => {
    if (!fs.existsSync(svc.outLog)) {
      return { name: svc.name, status: 'no_log' as const, lastSuccessAt: null,
               hoursAgo: null, staleThresholdHours: svc.staleAfterHours };
    }
    const lastSuccess = getLastSuccessTimestamp(svc.outLog, svc.donePattern);
    if (!lastSuccess) {
      return { name: svc.name, status: 'stale' as const, lastSuccessAt: null,
               hoursAgo: null, staleThresholdHours: svc.staleAfterHours };
    }
    const hoursAgo = (now - lastSuccess.getTime()) / (1000 * 60 * 60);
    const status = hoursAgo > svc.staleAfterHours ? 'stale' : 'ok';
    return {
      name: svc.name, status,
      lastSuccessAt: lastSuccess.toISOString(),
      hoursAgo: Math.round(hoursAgo * 10) / 10,
      staleThresholdHours: svc.staleAfterHours,
    };
  });
}

function calculateDayNumber(betaStartDate: string): number {
  const start = new Date(betaStartDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function determinePhase(dayNumber: number): HealthState['phase'] {
  if (dayNumber <= 0) return 'pre_launch';
  if (dayNumber <= 30) return 'beta_month_1';
  if (dayNumber <= 60) return 'beta_month_2';
  return 'live';
}

function determineTier(mrr: number, phase: string): string {
  // During beta, tier is always pre_launch or beta
  if (phase !== 'live') return 'pre_launch';

  if (mrr >= 5000) return 'normal';
  if (mrr >= 2000) return 'low_compute';
  if (mrr >= 500) return 'critical';
  return 'dead';
}

function determineHealthStatus(
  checks: HealthState['checks'],
  pm2: HealthState['pm2'],
): HealthState['status'] {
  const values = Object.values(checks);
  const failedCount = values.filter(v => v !== 'operational').length;

  // Any critical PM2 process (backend or openclaw-gateway) being down is at least 'critical'
  if (pm2.critical_down.length >= 2) return 'dead';
  if (pm2.critical_down.length === 1) {
    // backend down is worse than openclaw down
    if (pm2.critical_down.includes('backend')) return 'critical';
    return 'degraded';
  }

  // Only count persistent (always-on) processes — cron jobs stop between runs by design.
  const PERSISTENT_PROCESSES = ['backend', 'openclaw-gateway', 'ceo-ai-bot', 'mission-control'];
  const persistentDown = pm2.processes.filter(
    (p: any) => PERSISTENT_PROCESSES.includes(p.name) && p.status !== 'online'
  ).length;
  if (persistentDown >= PERSISTENT_PROCESSES.length / 2) return 'critical';

  if (failedCount === 0) return 'healthy';
  if (failedCount <= 2) return 'degraded';
  if (failedCount <= 4) return 'critical';
  return 'dead';
}

// ─── Health Checks ───────────────────────────────────────────────────

async function checkEndpoint(url: string, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);
    return response.ok || response.status === 401; // 401 means API is running but needs auth
  } catch {
    return false;
  }
}

async function runHealthChecks(): Promise<HealthState['checks']> {
  const SUPABASE_URL = 'https://igspopoejhsxvwvxyhbh.supabase.co';
  const DASHBOARD_URL = 'https://invoica-b89o.vercel.app';
  const WEBSITE_URL = 'https://invoica-rho.vercel.app';

  const [apiOk, dbOk, edgeFnOk, dashboardOk, websiteOk] = await Promise.all([
    checkEndpoint(`${SUPABASE_URL}/rest/v1/`),
    checkEndpoint(`${SUPABASE_URL}/rest/v1/`), // DB accessible through REST API
    checkEndpoint(`${SUPABASE_URL}/functions/v1/api/v1/health`, 15000), // cold starts can take up to ~5s
    checkEndpoint(DASHBOARD_URL),
    checkEndpoint(WEBSITE_URL),
  ]);

  return {
    api_status: apiOk ? 'operational' : 'down',
    database_status: dbOk ? 'operational' : 'down',
    edge_function_status: edgeFnOk ? 'operational' : 'down',
    dashboard_status: dashboardOk ? 'operational' : 'down',
    website_status: websiteOk ? 'operational' : 'down',
  };
}

// ─── MRR Calculation ─────────────────────────────────────────────────

async function fetchMRR(): Promise<number> {
  // TODO: Connect to Stripe API or Supabase billing table to get real MRR
  // For now, read from tier.json (manually updated or by CEO agent)
  try {
    const tier = readJSON<TierState>(TIER_FILE);
    return tier.mrr;
  } catch {
    return 0;
  }
}

// ─── Beta Metrics ────────────────────────────────────────────────────

async function fetchBetaMetrics(): Promise<HealthState['beta']> {
  // TODO: Connect to Supabase to query real beta metrics
  // For now, read from health.json and preserve existing values
  try {
    const health = readJSON<HealthState>(HEALTH_FILE);
    return health.beta;
  } catch {
    return {
      start_date: '2026-02-23',
      day_number: 0,
      agents_onboarded: 0,
      companies_onboarded: 0,
      api_integrations_live: 0,
      transactions_monitored: 0,
      founding_agent_badges: 0,
      early_adopter_badges: 0,
    };
  }
}

// ─── Agent Status ────────────────────────────────────────────────────

function scanAgentStatus(): HealthState['agents'] {
  const agentsDir = path.join(ROOT, 'agents');
  const agentDirs = fs.readdirSync(agentsDir).filter(d =>
    fs.statSync(path.join(agentsDir, d)).isDirectory()
  );

  // Read existing health for last_session preservation
  let existingAgents: Record<string, any> = {};
  try {
    const health = readJSON<HealthState>(HEALTH_FILE);
    existingAgents = health.agents.agents;
  } catch {}

  const agents: Record<string, { status: string; model: string; last_session: string | null }> = {};

  for (const dir of agentDirs) {
    const yamlPath = path.join(agentsDir, dir, 'agent.yaml');
    if (fs.existsSync(yamlPath)) {
      const yaml = fs.readFileSync(yamlPath, 'utf-8');
      const modelMatch = yaml.match(/llm:\s*(.+)/);
      const model = modelMatch ? modelMatch[1].trim() : 'unknown';

      agents[dir] = {
        status: 'yaml_configured', // NOT running — just means agent.yaml exists
        model,
        last_session: existingAgents[dir]?.last_session || null,
      };
    }
  }

  // NOTE: total_configured = count of agent.yaml files on disk.
  // This is NOT the number of running processes. For running processes, see pm2.online.
  return {
    total_configured: Object.keys(agents).length, // YAML config count only — NOT active/running
    agents,
  };
}

// ─── PM2 Live Process Status ─────────────────────────────────────────

// Processes whose outage should degrade/critical the overall health status
const CRITICAL_PM2_PROCESSES = ['backend', 'openclaw-gateway'];

function getPm2Status(): HealthState['pm2'] {
  let rawList: any[] = [];
  try {
    const out = execSync('pm2 jlist', { timeout: 8000, stdio: 'pipe' }).toString();
    rawList = JSON.parse(out);
  } catch (e: any) {
    console.log(`[Heartbeat] ⚠️  pm2 jlist failed: ${e.message}`);
    return { total: 0, online: 0, stopped: 0, errored: 0, critical_down: [], processes: [] };
  }

  const processes: Pm2ProcessInfo[] = rawList.map((p: any) => {
    const env = p.pm2_env || {};
    const status: string = env.status || 'unknown';
    const uptimeMs = (status === 'online' && env.pm_uptime)
      ? Date.now() - env.pm_uptime
      : null;
    return {
      name: p.name,
      status,
      restarts: env.restart_time ?? 0,
      uptimeMs,
      pid: p.pid ?? null,
      memory: p.monit?.memory ?? null,
      cpu: p.monit?.cpu ?? null,
    };
  });

  const statusMap = new Map(processes.map(p => [p.name, p.status]));
  const critical_down = CRITICAL_PM2_PROCESSES.filter(
    n => statusMap.get(n) !== 'online'
  );

  return {
    total: processes.length,
    online: processes.filter(p => p.status === 'online').length,
    stopped: processes.filter(p => p.status === 'stopped').length,
    errored: processes.filter(p => p.status === 'errored').length,
    critical_down,
    processes,
  };
}

// ─── Main Heartbeat ──────────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  const startTime = Date.now();
  console.log(`[Heartbeat] Starting at ${new Date().toISOString()}`);

  // 1. Read current state
  let currentTier: TierState;
  try {
    currentTier = readJSON<TierState>(TIER_FILE);
  } catch {
    console.error('[Heartbeat] Failed to read tier.json — using defaults');
    currentTier = readJSON<TierState>(TIER_FILE);
  }

  // 2. Run health checks
  const checks = await runHealthChecks();

  // 3. Calculate day number and phase
  const dayNumber = calculateDayNumber(currentTier.beta_start_date);
  const phase = determinePhase(dayNumber);

  // 4. Fetch MRR
  const mrr = await fetchMRR();

  // 5. Determine survival tier
  const newTier = determineTier(mrr, phase);
  const tierChanged = newTier !== currentTier.current_tier;

  // 6. Scan PM2 live process state
  const pm2Status = getPm2Status();
  console.log(`[Heartbeat] PM2: ${pm2Status.online}/${pm2Status.total} online` +
    (pm2Status.critical_down.length > 0 ? ` — CRITICAL DOWN: ${pm2Status.critical_down.join(', ')}` : ''));

  // 7. Scan agent YAML configs (for model/session tracking)
  const agentStatus = scanAgentStatus();

  // 8. Fetch beta metrics
  const betaMetrics = await fetchBetaMetrics();
  betaMetrics.day_number = dayNumber;

  // 9. Determine overall health — now informed by real PM2 state
  const healthStatus = determineHealthStatus(checks, pm2Status);

  // 10. Write health.json
  const health: HealthState = {
    last_heartbeat: new Date().toISOString(),
    status: healthStatus,
    phase,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    checks,
    pm2: pm2Status,
    agents: agentStatus,
    financials: {
      mrr,
      monthly_budget: 200,
      monthly_spend: 0, // TODO: Track from API costs
      gas_reserve_sol: 0,
      credit_balance_usd: 0,
    },
    beta: betaMetrics,
  };

  writeJSON(HEALTH_FILE, health);

  // 11. Update tier.json if tier changed
  if (tierChanged) {
    currentTier.current_tier = newTier;
    currentTier.mrr = mrr;
    currentTier.last_updated = new Date().toISOString();
    currentTier.day_number = dayNumber;
    currentTier.history.push({
      date: new Date().toISOString().split('T')[0],
      tier: newTier,
      mrr,
      event: `Tier changed to ${newTier}`,
    });
    writeJSON(TIER_FILE, currentTier);

    appendAudit(`[TIER_CHANGE] Tier changed from ${currentTier.current_tier} to ${newTier} (MRR: $${mrr})`);
    console.log(`[Heartbeat] ⚠️ TIER CHANGE: ${currentTier.current_tier} → ${newTier}`);
  }

  // 11. Log alerts for infra checks
  const downServices = Object.entries(checks).filter(([, v]) => v !== 'operational');
  if (downServices.length > 0) {
    const services = downServices.map(([k]) => k).join(', ');
    appendAudit(`[ALERT] Services down: ${services}`);
    console.log(`[Heartbeat] ⚠️ ALERT: Services down — ${services}`);
  }

  // 12. Check for critical conditions
  if (phase === 'live' && mrr < 500) {
    appendAudit(`[CRITICAL] Dead tier reached. MRR: $${mrr}. Human intervention required.`);
    console.log(`[Heartbeat] 🚨 CRITICAL: Dead tier — MRR $${mrr}. Human intervention required.`);
  }

  if (phase === 'live' && mrr < 2000 && mrr >= 500) {
    appendAudit(`[WARNING] Critical tier. MRR: $${mrr}. CEO emergency revenue protocol activated.`);
    console.log(`[Heartbeat] ⚠️ WARNING: Critical tier — MRR $${mrr}`);
  }

  // 13. Check heartbeat gap
  try {
    const prevHealth = readJSON<HealthState>(HEALTH_FILE);
    const lastBeat = new Date(prevHealth.last_heartbeat).getTime();
    const gapMinutes = (Date.now() - lastBeat) / (1000 * 60);
    if (gapMinutes > 90) {
      appendAudit(`[WARNING] Heartbeat gap detected: ${Math.floor(gapMinutes)} minutes since last beat`);
    }
  } catch {}

  // 14. PM2 cron service watchdog ──────────────────────────────────────
  const serviceHealths = checkCronServices();
  const staleServices = serviceHealths.filter(s => s.status !== 'ok');

  for (const svc of serviceHealths) {
    const icon = svc.status === 'ok' ? '✅' : '🔴';
    const ago = svc.hoursAgo !== null ? `${svc.hoursAgo}h ago` : 'never';
    console.log(`[Heartbeat] ${icon} ${svc.name}: last success ${ago} (threshold: ${svc.staleThresholdHours}h)`);
  }

  if (staleServices.length > 0) {
    // Self-healing: attempt PM2 restart for each stale service before alerting
    const autoRestarted: string[] = [];
    const stillStale: typeof staleServices = [];

    for (const svc of staleServices) {
      try {
        console.log(`[Heartbeat] 🔄 Auto-restarting stale service: ${svc.name}`);
        execSync(`pm2 restart ${svc.name}`, { timeout: 15000, stdio: 'pipe' });
        autoRestarted.push(svc.name);
        appendAudit(`[SELF_HEAL] Auto-restarted stale service: ${svc.name}`);
        console.log(`[Heartbeat] ✅ Restarted: ${svc.name}`);
      } catch (restartErr: any) {
        console.log(`[Heartbeat] ❌ Failed to restart ${svc.name}: ${restartErr.message}`);
        stillStale.push(svc);
      }
    }

    // Always notify — but distinguish auto-healed from persistent failures
    const restarted = autoRestarted.length > 0
      ? `\n\n✅ *Auto-restarted* (${autoRestarted.length}): ${autoRestarted.join(', ')}`
      : '';
    const persistent = stillStale.length > 0
      ? '\n\n🛑 *Still stale after restart* — manual fix needed:\n' +
        stillStale.map(s => {
          const ago = s.hoursAgo !== null ? `${s.hoursAgo}h ago` : 'never/no log';
          return `  • *${s.name}*: last success ${ago} (threshold ${s.staleThresholdHours}h)`;
        }).join('\n')
      : '';

    const telegramMsg = `⚡ *Invoica Self-Heal* — ${staleServices.length} stale service(s)${restarted}${persistent}`;
    appendAudit(`[ALERT] Stale cron services: ${staleServices.map(s => s.name).join(', ')} | Auto-restarted: ${autoRestarted.join(', ') || 'none'}`);
    console.log(`[Heartbeat] Self-heal complete — restarted: ${autoRestarted.length}, still stale: ${stillStale.length}`);
    await sendTelegram(telegramMsg);
  }

  // 15. Port-conflict guard — detect duplicate PM2 / orphan process on critical ports
  const CRITICAL_PORTS: Array<{ name: string; port: number }> = [
    { name: 'backend-api',      port: 3001  },
    { name: 'openclaw-gateway', port: 18789 },
  ];
  const portConflicts: string[] = [];

  for (const { name, port } of CRITICAL_PORTS) {
    try {
      const ssOut = execSync(`ss -tlnp | grep ':${port} '`, { timeout: 5000, stdio: 'pipe' }).toString();
      // Count distinct PIDs listening on this port
      const pidMatches = [...ssOut.matchAll(/pid=(\d+)/g)];
      const uniquePids = new Set(pidMatches.map(m => m[1]));
      if (uniquePids.size > 1) {
        const msg = `Port ${port} (${name}): ${uniquePids.size} conflicting listeners — PIDs ${[...uniquePids].join(', ')}`;
        portConflicts.push(msg);
        appendAudit(`[PORT_CONFLICT] ${msg}`);
        console.log(`[Heartbeat] 🔴 PORT CONFLICT: ${msg}`);

        // Self-heal: stop root PM2 entry for this port if root PM2 is running
        try {
          execSync(`sudo pm2 delete ${name} 2>/dev/null && sudo pm2 save --force 2>/dev/null`, { timeout: 10000, stdio: 'pipe' });
          appendAudit(`[SELF_HEAL] Removed ${name} from root PM2 to resolve port conflict`);
          console.log(`[Heartbeat] ✅ Removed ${name} from root PM2`);
        } catch { /* root PM2 may not be running — that's fine */ }
      } else {
        console.log(`[Heartbeat] ✅ Port ${port} (${name}): single owner, no conflict`);
      }
    } catch {
      // grep returns exit 1 when no match = port not in use at all (process may be stopped)
      console.log(`[Heartbeat] ℹ️  Port ${port} (${name}): not listening`);
    }
  }

  if (portConflicts.length > 0) {
    await sendTelegram(
      `🔴 *Port Conflict Detected*\n\nTwo processes fighting for the same port:\n` +
      portConflicts.map(c => `• ${c}`).join('\n') +
      `\n\nAttempted auto-fix. Check \`pm2 list\` + \`sudo pm2 list\`.`
    );
  }

  // 16. Send Telegram alert for infra failures (if any)
  if (downServices.length > 0) {
    const infraMsg = `⚠️ *Invoica Infra Alert*\n\nDown: ${downServices.map(([k]) => k).join(', ')}\nStatus: *${healthStatus}*\nDay ${dayNumber} | MRR $${mrr}`;
    await sendTelegram(infraMsg);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Heartbeat] Complete in ${elapsed}ms — Status: ${healthStatus}, Phase: ${phase}, Day: ${dayNumber}, Tier: ${newTier}, Cron services: ${serviceHealths.filter(s => s.status === 'ok').length}/${serviceHealths.length} ok`);

  // 16. 6-hour Telegram summary (fires at 00:xx, 06:xx, 12:xx, 18:xx UTC)
  const utcHour = new Date().getUTCHours();
  if (utcHour % 6 === 0) {
    const cronOk = serviceHealths.filter(s => s.status === 'ok').length;
    const cronTotal = serviceHealths.length;
    const infraOk = downServices.length === 0;
    const statusIcon = healthStatus === 'healthy' ? '✅' : healthStatus === 'degraded' ? '⚠️' : '🔴';
    const summaryLines = serviceHealths.map(s => {
      const ago = s.hoursAgo !== null ? `${s.hoursAgo}h ago` : 'never';
      const icon = s.status === 'ok' ? '✅' : '🔴';
      return `  ${icon} ${s.name}: ${ago}`;
    }).join('\n');
    // PM2 summary: show each process with status icon
    const pm2Lines = pm2Status.processes.map(p => {
      const icon = p.status === 'online' ? '🟢' : '🔴';
      const uptime = p.uptimeMs ? `${Math.floor(p.uptimeMs / 60000)}m` : 'stopped';
      const mem = p.memory ? ` ${Math.round(p.memory / 1024 / 1024)}MB` : '';
      return `  ${icon} ${p.name}: ${p.status} (${uptime}${mem}, ${p.restarts} restarts)`;
    }).join('\n');
    const summaryMsg =
      `${statusIcon} *Invoica 6h Summary* — ${new Date().toISOString().slice(0, 16)}UTC\n\n` +
      `*PM2* (${pm2Status.online}/${pm2Status.total} online):\n${pm2Lines || '  none'}\n\n` +
      `*Cron agents* (${cronOk}/${cronTotal} ok):\n${summaryLines}\n\n` +
      `Infra: ${infraOk ? '✅ all operational' : '⚠️ ' + downServices.map(([k]) => k).join(', ')}\n` +
      `MRR: $${mrr} | Day ${dayNumber} | ${phase} | Health: *${healthStatus}*`;
    await sendTelegram(summaryMsg);
  }

  // 17. Dead-man's switch ping — proves heartbeat is alive to external monitor (1h period)
  const pingUrl = process.env.HEALTHCHECK_PING_URL;
  if (pingUrl) {
    try {
      await fetch(pingUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
      console.log('[Heartbeat] ✅ Dead-man ping sent');
    } catch {
      console.log('[Heartbeat] ⚠️ Dead-man ping failed (check HEALTHCHECK_PING_URL)');
    }
  }
}

// ─── Execute ─────────────────────────────────────────────────────────

heartbeat().catch(err => {
  console.error('[Heartbeat] Fatal error:', err);
  appendAudit(`[ERROR] Heartbeat failed: ${err.message}`);
  process.exit(1);
});
