// Achiri HTTP API Server — Sprint 115
// Exposes AchiriConversationHandler as a REST endpoint.
// Port: 3420 (ACHIRI_PORT env override)
// Routes:
//   POST   /chat           { userId, tier?, message } → { reply, turns_in_memory, model, provider, tier }
//   DELETE /memory/:userId → { ok: true }
//   GET    /stats          → { users, total_turns, uptime_s }
//   GET    /health         → { status: 'ok', version: '115' }

import * as http from 'http';
import { AchiriConversationHandler } from './index';
import { AchiriMemoryStore } from './memory-store';

const PORT = parseInt(process.env.ACHIRI_PORT ?? '3420', 10);
const START_TIME = Date.now();

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const memStore = new AchiriMemoryStore();

// Cache handlers per tier (constructor reads files from disk once)
const handlerCache: Partial<Record<string, AchiriConversationHandler>> = {};

function getHandler(tier: string, userId: string): AchiriConversationHandler {
  const validTier = ['free', 'tnd_basic', 'tnd_premium'].includes(tier) ? tier : 'free';
  // userId-keyed so memory is per-user
  const cacheKey = validTier + ':' + userId;
  if (!handlerCache[cacheKey]) {
    handlerCache[cacheKey] = new AchiriConversationHandler(
      validTier as 'free' | 'tnd_basic' | 'tnd_premium',
      userId,
    );
  }
  return handlerCache[cacheKey]!;
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // GET /health
  if (method === 'GET' && url === '/health') {
    return send(res, 200, { status: 'ok', version: '115', uptime_s: Math.floor((Date.now() - START_TIME) / 1000) });
  }

  // GET /stats
  if (method === 'GET' && url === '/stats') {
    const stats = memStore.getStats();
    return send(res, 200, { ...stats, uptime_s: Math.floor((Date.now() - START_TIME) / 1000) });
  }

  // DELETE /memory/:userId
  if (method === 'DELETE' && url.startsWith('/memory/')) {
    const userId = decodeURIComponent(url.slice('/memory/'.length));
    if (!userId) return send(res, 400, { error: 'userId required' });
    memStore.clearHistory(userId);
    // Also evict from handler cache
    for (const key of Object.keys(handlerCache)) {
      if (key.endsWith(':' + userId)) delete handlerCache[key];
    }
    console.log('[Achiri API] memory cleared for user:', userId);
    return send(res, 200, { ok: true });
  }

  // POST /chat
  if (method === 'POST' && url === '/chat') {
    let body: { userId?: string; tier?: string; message?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid JSON' });
    }

    const { userId = 'anonymous', tier = 'free', message } = body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return send(res, 400, { error: 'message is required' });
    }

    try {
      const handler = getHandler(tier, userId);
      const modelConfig = handler.getModelConfig();
      const reply = await handler.chat(message.trim());
      const turns = memStore.loadHistory(userId).length;
      console.log('[Achiri API] /chat userId=' + userId + ' tier=' + tier + ' turns_after=' + turns);
      return send(res, 200, {
        reply,
        turns_in_memory: turns,
        model: modelConfig.model,
        provider: modelConfig.provider,
        tier: modelConfig.tier,
      });
    } catch (err) {
      console.error('[Achiri API] /chat error:', err);
      return send(res, 500, { error: 'internal error' });
    }
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log('[Achiri API] listening on port ' + PORT);
  console.log('[Achiri API] routes: POST /chat, DELETE /memory/:userId, GET /stats, GET /health');
});

export { server };
