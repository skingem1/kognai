// Achiri HTTP API Server — Sprint 115 + Sprint 126 (paymee) + Sprint 127 (voice)
// Exposes AchiriConversationHandler as a REST endpoint.
// Port: 3420 (ACHIRI_PORT env override)
// Routes:
//   POST   /chat                { userId, tier?, message } → { reply, turns_in_memory, model, provider, tier }
//   POST   /voice               { userId, tier, audioText, audioFilePath? } → { transcript, reply, voice_reply, model, provider, tier, whisper_used }
//   GET    /upgrade             ?tier=tnd_basic&userId=xxx → { checkout_url, order_id, amount_tnd, tier, mock }
//   DELETE /memory/:userId      → { ok: true }
//   GET    /stats               → { users, total_turns, uptime_s }
//   GET    /health              → { status: 'ok', version: '127' }

import * as http from 'http';
import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from './index';
import { AchiriMemoryStore } from './memory-store';
import { createCheckoutUrl } from './paymee';
import { processVoiceMessage, VoiceTierError } from './voice-handler';

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

// Sprint 296: LRU handler cache — evicts oldest when exceeding MAX_CACHED_HANDLERS
const MAX_CACHED_HANDLERS = 100;
const handlerCache = new Map<string, AchiriConversationHandler>();

function getHandler(tier: string, userId: string): AchiriConversationHandler {
  const validTier = ['free', 'tnd_basic', 'tnd_premium'].includes(tier) ? tier : 'free';
  const cacheKey = validTier + ':' + userId;
  const existing = handlerCache.get(cacheKey);
  if (existing) {
    // Move to end (most recently used)
    handlerCache.delete(cacheKey);
    handlerCache.set(cacheKey, existing);
    return existing;
  }
  // Evict oldest if at capacity
  if (handlerCache.size >= MAX_CACHED_HANDLERS) {
    const oldest = handlerCache.keys().next().value!;
    handlerCache.delete(oldest);
  }
  const handler = new AchiriConversationHandler(
    validTier as 'free' | 'tnd_basic' | 'tnd_premium',
    userId,
  );
  handlerCache.set(cacheKey, handler);
  return handler;
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // GET /health
  if (method === 'GET' && url === '/health') {
    return send(res, 200, { status: 'ok', version: '296', uptime_s: Math.floor((Date.now() - START_TIME) / 1000), cached_handlers: handlerCache.size });
  }

  // GET /upgrade?tier=tnd_basic&userId=xxx
  if (method === 'GET' && url.startsWith('/upgrade')) {
    const params = new URL(url, 'http://localhost').searchParams;
    const tier = params.get('tier') as 'tnd_basic' | 'tnd_premium' | null;
    const userId = params.get('userId') ?? 'anonymous';
    if (!tier || !['tnd_basic', 'tnd_premium'].includes(tier)) {
      return send(res, 400, { error: 'tier must be tnd_basic or tnd_premium' });
    }
    try {
      const result = await createCheckoutUrl({ userId, tier });
      console.log('[Achiri API] /upgrade userId=' + userId + ' tier=' + tier + ' mock=' + result.mock);
      return send(res, 200, result);
    } catch (err) {
      console.error('[Achiri API] /upgrade error:', err);
      return send(res, 500, { error: 'payment gateway error' });
    }
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
    // Also evict from handler cache (Sprint 296: Map-based)
    const suffix = ':' + userId;
    Array.from(handlerCache.keys()).forEach(key => {
      if (key.endsWith(suffix)) handlerCache.delete(key);
    });
    console.log('[Achiri API] memory cleared for user:', userId);
    return send(res, 200, { ok: true });
  }

  // POST /voice — tnd_premium only (Sprint 127)
  if (method === 'POST' && url === '/voice') {
    let body: { userId?: string; tier?: string; audioText?: string; audioFilePath?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid JSON' });
    }
    const { userId = 'anonymous', tier = 'free', audioText = '', audioFilePath } = body;
    if (!audioText && !audioFilePath) {
      return send(res, 400, { error: 'audioText or audioFilePath is required' });
    }
    try {
      const result = await processVoiceMessage({ userId, tier, audioText, audioFilePath });
      console.log('[Achiri API] /voice userId=' + userId + ' tier=' + tier + ' whisper=' + result.whisper_used);
      return send(res, 200, result);
    } catch (err) {
      if (err instanceof VoiceTierError) {
        return send(res, 403, { error: 'tier_error', message: (err as Error).message, required_tier: 'tnd_premium' });
      }
      console.error('[Achiri API] /voice error:', err);
      return send(res, 500, { error: 'internal error' });
    }
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

      // Detect daily limit exceeded sentinel (Sprint 122)
      if (reply.startsWith(ACHIRI_LIMIT_EXCEEDED)) {
        const humanMsg = reply.slice(ACHIRI_LIMIT_EXCEEDED.length).trim();
        // Reset midnight UTC
        const tomorrow = new Date();
        tomorrow.setUTCHours(24, 0, 0, 0);
        const resetAt = tomorrow.toISOString();
        console.log('[Achiri API] limit_exceeded userId=' + userId + ' tier=' + tier);
        // Generate upgrade link for tnd_basic (cheapest paid tier) — Sprint 126
        let upgradeUrl: string | undefined;
        try {
          const checkout = await createCheckoutUrl({ userId, tier: 'tnd_basic' });
          upgradeUrl = checkout.checkout_url;
        } catch { /* non-fatal: payment gateway down */ }
        return send(res, 200, {
          error: 'limit_exceeded',
          reply: humanMsg,
          reset_at: resetAt,
          upgrade_tiers: ['tnd_basic', 'tnd_premium'],
          upgrade_url: upgradeUrl,
        });
      }

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
  console.log('[Achiri API] routes: POST /chat, POST /voice, GET /upgrade, DELETE /memory/:userId, GET /stats, GET /health');
});

export { server };
