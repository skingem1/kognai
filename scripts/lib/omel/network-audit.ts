/**
 * OMEL Network Audit — SEC1 (Sprint TICKET-012-SEC1)
 *
 * Checks that Ollama is bound to loopback (127.0.0.1) only.
 * SEC1 requirement: netstat-equivalent check that OLLAMA_HOST is not 0.0.0.0.
 *
 * Usage:
 *   import { auditOllamaLoopback } from './network-audit';
 *   const result = auditOllamaLoopback();
 *   if (!result.pass) { // escalate }
 *
 * Logs to: logs/omel/network-audit-YYYY-MM-DD.jsonl
 */

import * as fs   from 'fs';
import * as path from 'path';

const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs', 'omel');

export interface NetworkAuditResult {
  check:       'ollama_loopback';
  pass:        boolean;
  ollama_host: string;
  reason:      string;
  audited_at:  string;
}

function logAudit(result: NetworkAuditResult): void {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(LOGS_DIR, `network-audit-${date}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(result) + '\n');
  } catch { /* never crash caller */ }
}

/**
 * SEC1: Verify OLLAMA_HOST is not bound to 0.0.0.0 (all interfaces).
 *
 * Pass:  OLLAMA_HOST is 127.0.0.1 or localhost (loopback only)
 * Fail:  OLLAMA_HOST is 0.0.0.0, *, empty without loopback, or any non-loopback IP
 *
 * If OLLAMA_HOST is unset, defaults to 127.0.0.1:11434 (safe).
 */
export function auditOllamaLoopback(): NetworkAuditResult {
  const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  const audited_at = new Date().toISOString();

  // Extract the hostname/IP from the URL
  let hostname = host;
  try {
    const url = new URL(host.startsWith('http') ? host : `http://${host}`);
    hostname = url.hostname;
  } catch {
    // Malformed URL — flag as fail
    const result: NetworkAuditResult = {
      check: 'ollama_loopback',
      pass: false,
      ollama_host: host,
      reason: `Malformed OLLAMA_HOST URL: "${host}" — cannot verify loopback binding`,
      audited_at,
    };
    logAudit(result);
    return result;
  }

  const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  const isAllInterfaces = hostname === '0.0.0.0' || hostname === '*' || hostname === '';

  let pass: boolean;
  let reason: string;

  if (isLoopback) {
    pass = true;
    reason = `OLLAMA_HOST="${host}" is bound to loopback (${hostname}) — SEC1 compliant`;
  } else if (isAllInterfaces) {
    pass = false;
    reason = `SECURITY VIOLATION: OLLAMA_HOST="${host}" binds to all interfaces (${hostname}) — SEC1 requires loopback only`;
  } else {
    pass = false;
    reason = `SECURITY ALERT: OLLAMA_HOST="${host}" binds to non-loopback address (${hostname}) — SEC1 requires 127.0.0.1 or localhost`;
  }

  const result: NetworkAuditResult = { check: 'ollama_loopback', pass, ollama_host: host, reason, audited_at };
  logAudit(result);
  return result;
}
