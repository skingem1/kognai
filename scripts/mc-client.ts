/**
 * mc-client.ts — Mission Control API client for Invoica agents
 *
 * Provides lightweight connect/heartbeat/token-reporting for any Invoica agent
 * to register itself with the Mission Control dashboard.
 *
 * API (from builderz-labs/mission-control):
 *   POST   /api/connect                 → register, get connection_id + agent_id
 *   POST   /api/agents/:id/heartbeat    → keep-alive (every 30s for long-running agents)
 *   POST   /api/tokens                  → report token usage for cost tracking
 *   DELETE /api/connect                 → deregister on shutdown
 *
 * Auth: Bearer token = MC_API_KEY env var
 * Base URL: MC_BASE_URL env var (default http://localhost:3010)
 *
 * Fails silently if Mission Control is not running or MC_API_KEY is not set.
 *
 * Usage (long-running agent):
 *   const mc = new MCClient('ceo-ai-bot', 'executive');
 *   await mc.connect();
 *   mc.startHeartbeatLoop(30_000);
 *   process.on('SIGTERM', async () => { mc.stopHeartbeatLoop(); await mc.disconnect(); });
 *
 * Usage (cron agent):
 *   const mc = new MCClient('memory-agent', 'observer');
 *   await mc.connect();
 *   // ... do work ...
 *   await mc.reportTokens('claude-haiku-4-5', 800, 400);
 *   await mc.disconnect();
 */

import * as http from 'http';
import * as https from 'https';
import 'dotenv/config';

// ── Config ──────────────────────────────────────────────────────────────────

const MC_BASE_URL  = process.env.MC_BASE_URL  || 'http://localhost:3010';
const MC_API_KEY   = process.env.MC_API_KEY   || '';
const TOOL_NAME    = 'invoica-agent';
const TOOL_VERSION = '1.0.0';

// Mission Control model pricing keys for common Invoica models
// (maps our internal names to MC's pricing table names)
const MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5':              'claude-haiku-4-5',
  'claude-3-5-haiku-latest':       'anthropic/claude-3-5-haiku-latest',
  'claude-sonnet-4-5':             'claude-sonnet-4',
  'claude-3-5-sonnet-20241022':    'claude-sonnet-4',
  'MiniMax-Text-01':               'minimax/minimax-m2.1',
};

// ── HTTP helper ──────────────────────────────────────────────────────────────

function mcRequest(method: string, path: string, body?: object, timeoutMs = 8_000): Promise<any | null> {
  return new Promise((resolve) => {
    if (!MC_API_KEY) { resolve(null); return; }

    const bodyStr = body ? JSON.stringify(body) : '';
    let url: URL;
    try { url = new URL(path, MC_BASE_URL); } catch { resolve(null); return; }

    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 3010;

    const options: http.RequestOptions = {
      hostname : url.hostname,
      port     : url.port ? parseInt(url.port, 10) : defaultPort,
      path     : url.pathname + url.search,
      method,
      headers  : {
        'Content-Type'  : 'application/json',
        'Authorization' : `Bearer ${MC_API_KEY}`,
        ...(bodyStr ? { 'Content-Length': String(Buffer.byteLength(bodyStr)) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });

    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── MCClient class ───────────────────────────────────────────────────────────

export class MCClient {
  private readonly agentName  : string;
  private readonly agentRole  : string;
  private connectionId        : string | null = null;
  private agentId             : number | null = null;
  private heartbeatTimer      : ReturnType<typeof setInterval> | null = null;
  private connected           : boolean = false;

  constructor(agentName: string, agentRole = 'agent') {
    this.agentName = agentName;
    this.agentRole = agentRole;
  }

  // ── Connect ───────────────────────────────────────────────────────────────
  async connect(): Promise<boolean> {
    if (!MC_API_KEY) return false;
    try {
      const res = await mcRequest('POST', '/api/connect', {
        tool_name   : TOOL_NAME,
        tool_version: TOOL_VERSION,
        agent_name  : this.agentName,
        agent_role  : this.agentRole,
      });
      if (!res?.connection_id) return false;

      this.connectionId = res.connection_id as string;
      this.agentId      = Number(res.agent_id);
      this.connected    = true;
      console.log(`[MCClient] ${this.agentName} connected to Mission Control (agent_id=${this.agentId})`);
      return true;
    } catch { return false; }
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  async heartbeat(tokenUsage?: { model: string; inputTokens: number; outputTokens: number }): Promise<void> {
    if (!this.agentId || !this.connected) return;
    try {
      const body: Record<string, unknown> = { connection_id: this.connectionId };
      if (tokenUsage) {
        body.token_usage = {
          model       : MODEL_MAP[tokenUsage.model] || tokenUsage.model,
          inputTokens : tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
        };
      }
      await mcRequest('POST', `/api/agents/${this.agentId}/heartbeat`, body);
    } catch { /* silent */ }
  }

  // ── Report token usage (standalone, without heartbeat) ────────────────────
  async reportTokens(
    model        : string,
    inputTokens  : number,
    outputTokens : number,
    operation    = 'agent_run',
  ): Promise<void> {
    if (!MC_API_KEY) return;
    try {
      await mcRequest('POST', '/api/tokens', {
        model       : MODEL_MAP[model] || model,
        sessionId   : `${this.agentName}:cli`,
        inputTokens,
        outputTokens,
        operation,
      });
    } catch { /* silent */ }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  async disconnect(): Promise<void> {
    if (!this.connectionId || !this.connected) return;
    try {
      await mcRequest('DELETE', '/api/connect', { connection_id: this.connectionId });
      console.log(`[MCClient] ${this.agentName} disconnected from Mission Control`);
    } catch { /* silent */ } finally {
      this.connected    = false;
      this.connectionId = null;
      this.agentId      = null;
    }
  }

  // ── Heartbeat loop (for long-running agents) ──────────────────────────────
  startHeartbeatLoop(intervalMs = 30_000): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch(() => {});
    }, intervalMs);
    // Don't block process exit
    if (typeof this.heartbeatTimer === 'object' && 'unref' in this.heartbeatTimer) {
      (this.heartbeatTimer as any).unref();
    }
  }

  stopHeartbeatLoop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Convenience: full lifecycle for cron agents ───────────────────────────
  // Connects, runs the provided function, then disconnects.
  async runSession<T>(
    fn: (mc: MCClient) => Promise<T>
  ): Promise<T> {
    await this.connect();
    try {
      return await fn(this);
    } finally {
      await this.disconnect();
    }
  }
}

// ── Convenience singleton factory ─────────────────────────────────────────────

export function createMCClient(agentName: string, agentRole?: string): MCClient {
  return new MCClient(agentName, agentRole);
}
