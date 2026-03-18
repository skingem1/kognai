// OMEL Credential Vault — Sprint 177 (AMD-13)
// Controlled access to secrets from process.env.
// NEVER logs secret values — only key names and masked representations.
//
// Public API:
//   getSecret(key)        — reads from process.env, NEVER logs value
//   listSecrets()         — returns key NAMES only, never values
//   hasSecret(key)        — boolean presence check
//   maskForLog(value)     — "sk-****...****" pattern for safe logging
//
// Audit log: logs/omel/vault-access-YYYY-MM-DD.jsonl (key name + agent_id, never value)
// Passive scanner: warns if a known secret value appears verbatim in any log line

import * as fs   from 'fs';
import * as path from 'path';

const LOGS_DIR   = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
const AUDIT_FILE = () => {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `vault-access-${date}.jsonl`);
};

fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Known secret key prefixes for passive leak scanner ───────────────────────
// Only the KEY NAMES are listed here — used to identify which env values to watch for
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

// Collect all known secret keys at startup
function collectSecretKeys(): string[] {
  return Object.keys(process.env).filter(k =>
    SECRET_KEY_PATTERNS.some(p => p.test(k))
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function auditLog(key: string, agentId: string, action: 'get' | 'check' | 'list'): void {
  const entry = {
    ts:       new Date().toISOString(),
    key,
    agent_id: agentId,
    action,
    // value is NEVER logged
  };
  try {
    fs.appendFileSync(AUDIT_FILE(), JSON.stringify(entry) + '\n');
  } catch { /* if log write fails, never crash caller */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export class CredentialVault {

  /**
   * Read a secret from process.env.
   * The value is returned to the caller but NEVER written to logs.
   * @param key   The env variable name (e.g. "ANTHROPIC_API_KEY")
   * @param agentId  The requesting agent (for audit trail)
   * @returns The secret value, or empty string if not set
   */
  getSecret(key: string, agentId = 'orchestrator'): string {
    auditLog(key, agentId, 'get');
    return process.env[key] ?? '';
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
   * If value is too short to mask safely, returns "****".
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
   * Intended for use before writing to any log file or Telegram.
   * @param line  The string about to be logged
   * @returns Array of key names whose values appear in the line (empty = safe)
   */
  scanForLeaks(line: string): string[] {
    const leaked: string[] = [];
    for (const key of collectSecretKeys()) {
      const value = process.env[key];
      if (value && value.length >= 8 && line.includes(value)) {
        leaked.push(key);
        // Warn to stderr (never to a log file that would compound the leak)
        process.stderr.write(
          `[OMEL-VAULT] ⚠️  Secret value for ${key} detected in log line — redact before writing!\n`
        );
      }
    }
    return leaked;
  }
}

// Exported singleton
export const credentialVault = new CredentialVault();
