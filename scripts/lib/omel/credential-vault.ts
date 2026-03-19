// OMEL Credential Vault — Sprint 177 + Sprint 182 Hardening (AMD-13)
// Controlled access to secrets from process.env.
// NEVER logs secret values — only key names and masked representations.
//
// Public API:
//   getSecret(key)        — reads from process.env, NEVER logs value
//   listSecrets()         — returns key NAMES only, never values
//   hasSecret(key)        — boolean presence check
//   maskForLog(value)     — "sk-****...****" pattern for safe logging
//   scanForLeaks(line)    — detect verbatim secret values in a log line
//   audit()               — CTO pre-check report: all secrets status
//
// Sprint 182 hardening additions:
//   - Secret rotation detection: alert if key unchanged for >90 days
//   - Passive log scanner: scan last 100 log lines per orchestrator run
//   - Access rate limiting: same key accessed >50× in 60s → alert
//   - Required secrets check: startup validation of critical env vars
//   - audit() report method for CTO approval gate
//
// Audit log: logs/omel/vault-access-YYYY-MM-DD.jsonl (key name + agent_id, never value)

import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';

const LOGS_DIR   = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
const VAULT_META = path.join(LOGS_DIR, 'vault-rotation-meta.json');
const AUDIT_FILE = () => {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `vault-access-${date}.jsonl`);
};

fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Telegram fire-and-forget ──────────────────────────────────────────────────

function sendTelegramAlert(message: string): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN     || '';
  const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) return;
  const payload = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  try {
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${botToken}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch { /* silent */ }
}

// ── Known secret key prefixes for passive leak scanner ───────────────────────
const SECRET_KEY_PATTERNS: RegExp[] = [
  /^ANTHROPIC_API_KEY$/,
  /^OPENAI_API_KEY$/,
  /^TELEGRAM_BOT_TOKEN$/,
  /^CEO_TELEGRAM_BOT_TOKEN$/,
  /^STRIPE_SECRET_KEY$/,
  /^STRIPE_WEBHOOK_SECRET$/,
  /^TIKTOK_ACCESS_TOKEN$/,
  /.*_API_KEY$/,
  /.*_SECRET$/,
  /.*_TOKEN$/,
  /.*_PASSWORD$/,
  /.*_PRIVATE_KEY$/,
];

// Required secrets that must be present at startup
const REQUIRED_SECRETS: string[] = [
  'TELEGRAM_BOT_TOKEN',
  'OWNER_TELEGRAM_CHAT_ID',
];

// ── Collect known secret keys ─────────────────────────────────────────────────

function collectSecretKeys(): string[] {
  return Object.keys(process.env).filter(k =>
    SECRET_KEY_PATTERNS.some(p => p.test(k))
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function auditLog(key: string, agentId: string, action: 'get' | 'check' | 'list' | 'rate_limit' | 'rotation_alert'): void {
  const entry = {
    ts:       new Date().toISOString(),
    key,
    agent_id: agentId,
    action,
  };
  try {
    fs.appendFileSync(AUDIT_FILE(), JSON.stringify(entry) + '\n');
  } catch { /* if log write fails, never crash caller */ }
}

// ── Rotation metadata (last-seen hash per key, stored to disk) ────────────────

interface RotationMeta {
  [key: string]: { last_seen_date: string; hash: string };
}

function loadRotationMeta(): RotationMeta {
  try {
    if (fs.existsSync(VAULT_META)) {
      return JSON.parse(fs.readFileSync(VAULT_META, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveRotationMeta(meta: RotationMeta): void {
  try {
    fs.writeFileSync(VAULT_META, JSON.stringify(meta, null, 2), 'utf-8');
  } catch { /* non-fatal */ }
}

function hashSecret(value: string): string {
  // Simple FNV-1a hash for rotation detection (not cryptographic, just drift detection)
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

// ── Rate limiting (in-memory, resets on restart) ──────────────────────────────

interface RateWindow {
  count:      number;
  windowStart: number;
}

const RATE_LIMIT_MAX   = 50;   // accesses per window
const RATE_LIMIT_WINDOW = 60_000; // 60 seconds

// ── CredentialVault class ─────────────────────────────────────────────────────

export class CredentialVault {
  private rateCounters = new Map<string, RateWindow>();

  // ── Rate limiting helper ────────────────────────────────────────────────────

  private checkRateLimit(key: string, agentId: string): void {
    const now = Date.now();
    const win = this.rateCounters.get(key);

    if (!win || now - win.windowStart > RATE_LIMIT_WINDOW) {
      // Start fresh window
      this.rateCounters.set(key, { count: 1, windowStart: now });
      return;
    }

    win.count++;
    if (win.count > RATE_LIMIT_MAX) {
      auditLog(key, agentId, 'rate_limit');
      sendTelegramAlert(
        `⚠️ *[OMEL Vault] Rate Limit Alert*\n` +
        `Key: \`${key}\` accessed ${win.count}× in 60s by \`${agentId}\`\n` +
        `Possible infinite loop or runaway agent.`
      );
    }
  }

  // ── Rotation detection ──────────────────────────────────────────────────────

  private checkRotation(key: string, value: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const meta  = loadRotationMeta();
    const h     = hashSecret(value);

    if (!meta[key]) {
      meta[key] = { last_seen_date: today, hash: h };
      saveRotationMeta(meta);
      return;
    }

    if (meta[key].hash !== h) {
      // Secret rotated — update record
      meta[key] = { last_seen_date: today, hash: h };
      saveRotationMeta(meta);
      return;
    }

    // Same hash — check age
    const daysSince = Math.floor(
      (Date.now() - new Date(meta[key].last_seen_date).getTime()) / 86_400_000
    );
    if (daysSince > 90) {
      auditLog(key, 'system', 'rotation_alert');
      sendTelegramAlert(
        `🔑 *[OMEL Vault] Rotation Alert*\n` +
        `Key: \`${key}\` has not been rotated in *${daysSince} days* (threshold: 90)\n` +
        `Consider rotating this secret.`
      );
    }
  }

  /**
   * Read a secret from process.env.
   * The value is returned to the caller but NEVER written to logs.
   */
  getSecret(key: string, agentId = 'orchestrator'): string {
    auditLog(key, agentId, 'get');
    this.checkRateLimit(key, agentId);
    const value = process.env[key] ?? '';
    if (value) this.checkRotation(key, value);
    return value;
  }

  /**
   * Return the NAMES of all env variables matching known secret patterns.
   * Values are NEVER returned.
   */
  listSecrets(agentId = 'orchestrator'): string[] {
    const keys = collectSecretKeys();
    auditLog('__all__', agentId, 'list');
    return keys;
  }

  /**
   * Check if a secret is present (non-empty).
   */
  hasSecret(key: string, agentId = 'orchestrator'): boolean {
    auditLog(key, agentId, 'check');
    return Boolean(process.env[key]);
  }

  /**
   * Mask a secret value for safe inclusion in logs or Telegram messages.
   * Format: first 4 chars + "****...****" + last 4 chars.
   */
  maskForLog(value: string): string {
    if (!value) return '****';
    if (value.length <= 8) return '****';
    const prefix = value.slice(0, 4);
    const suffix = value.slice(-4);
    return `${prefix}****...****${suffix}`;
  }

  /**
   * Passive leak scanner: check if any known secret value appears verbatim
   * in the given log line. Returns the leaked key names (never the values).
   */
  scanForLeaks(line: string): string[] {
    const leaked: string[] = [];
    for (const key of collectSecretKeys()) {
      const value = process.env[key];
      if (value && value.length >= 8 && line.includes(value)) {
        leaked.push(key);
        process.stderr.write(
          `[OMEL-VAULT] ⚠️  Secret value for ${key} detected in log line — redact before writing!\n`
        );
      }
    }
    return leaked;
  }

  /**
   * Scan last N lines of a log file for secret leaks.
   * Returns list of (key, line_number) tuples where leaks were detected.
   * Intended for use by CTO gate pre-check and orchestrator run startup.
   */
  scanLogFile(logFilePath: string, lastNLines = 100): Array<{ key: string; lineIndex: number }> {
    const results: Array<{ key: string; lineIndex: number }> = [];
    try {
      if (!fs.existsSync(logFilePath)) return results;
      const lines = fs.readFileSync(logFilePath, 'utf-8')
        .split('\n').filter(l => l.trim());
      const slice = lines.slice(-lastNLines);
      slice.forEach((line, i) => {
        const leaked = this.scanForLeaks(line);
        for (const key of leaked) results.push({ key, lineIndex: i });
      });
    } catch { /* non-fatal */ }
    return results;
  }

  /**
   * Startup required-secrets validation.
   * Logs + throws if any required key is missing.
   * Call once at orchestrator startup.
   */
  validateRequired(requiredKeys: string[] = REQUIRED_SECRETS): void {
    const missing = requiredKeys.filter(k => !process.env[k]);
    if (missing.length === 0) return;
    const msg = `[OMEL-VAULT] Missing required secrets: ${missing.join(', ')}`;
    process.stderr.write(msg + '\n');
    try {
      fs.appendFileSync(AUDIT_FILE(), JSON.stringify({
        ts:     new Date().toISOString(),
        action: 'startup_validation_failed',
        missing,
      }) + '\n');
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  /**
   * CTO approval gate audit report.
   * Returns a summary of vault state: which secrets are present, rotation status.
   * Values are NEVER included.
   */
  audit(): {
    total_secrets:       number;
    present:             string[];
    missing:             string[];
    rotation_warnings:   string[];
    generated_at:        string;
  } {
    const keys            = collectSecretKeys();
    const present         = keys.filter(k  => Boolean(process.env[k]));
    const missing         = REQUIRED_SECRETS.filter(k => !process.env[k]);
    const rotationWarnings: string[] = [];

    const meta = loadRotationMeta();
    for (const key of present) {
      if (meta[key]) {
        const daysSince = Math.floor(
          (Date.now() - new Date(meta[key].last_seen_date).getTime()) / 86_400_000
        );
        if (daysSince > 90) rotationWarnings.push(`${key} (${daysSince}d)`);
      }
    }

    return {
      total_secrets:     keys.length,
      present,
      missing,
      rotation_warnings: rotationWarnings,
      generated_at:      new Date().toISOString(),
    };
  }
}

// Exported singleton
export const credentialVault = new CredentialVault();
