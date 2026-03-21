// Achiri HTTP API Server — Sprint 115 + Sprint 126 (paymee) + Sprint 127 (voice)
// Exposes AchiriConversationHandler as a REST endpoint.
// Port: 3420 (ACHIRI_PORT env override)
// Routes:
//   POST   /chat                { userId, tier?, message } → { reply, turns_in_memory, model, provider, tier }
//   POST   /voice               { userId, tier, audioText, audioFilePath? } → { transcript, reply, voice_reply, model, provider, tier, whisper_used }
//   GET    /upgrade             ?tier=tnd_basic&userId=xxx → { checkout_url, order_id, amount_tnd, tier, mock }
//   GET    /summary/:userId      → { userId, facts, total_turns_summarized, last_updated }
//   GET    /profile/:userId      → { userId, preferred_language, top_interests, message_count, ... }
//   GET    /export/:userId       → { userId, turns, profile, summary_facts, conversation }
//   DELETE /memory/:userId      → { ok: true }
//   GET    /stats               → { users, total_turns, uptime_s }
//   GET    /health              → { status: 'ok', version: '301' }

import * as http from 'http';
import { AchiriConversationHandler, ACHIRI_LIMIT_EXCEEDED } from './index';
import { AchiriMemoryStore } from './memory-store';
import { createCheckoutUrl } from './paymee';
import { processVoiceMessage, VoiceTierError } from './voice-handler';
import { extractUserProfile } from './user-profile';
import { loadSummary } from './conversation-summary';
import { trackError, getErrorSummary } from './error-tracker';
import { getFeedbackSummary } from './feedback-collector';
import { publishAchiriChat } from '../../scripts/lib/event-bus-publisher';
import { getUserTier, setUserTier, type AchiriTier } from './tier-store';

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
    return send(res, 200, { status: 'ok', version: '301', uptime_s: Math.floor((Date.now() - START_TIME) / 1000), cached_handlers: handlerCache.size });
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

  // GET /analytics — Sprint 324: unified alpha monitoring dashboard
  if (method === 'GET' && url === '/analytics') {
    const stats = memStore.getStats();
    const feedback = getFeedbackSummary();
    const errors = getErrorSummary();

    // DAU from daily-counts.json
    const dailyCountsPath = require('path').join(__dirname, '..', '..', 'workspace', 'achiri', 'daily-counts.json');
    let dau = 0;
    let totalMessages = 0;
    let activeDays = 0;
    let retention7d = 0;
    let returningUsers = 0;
    try {
      const counts = JSON.parse(require('fs').readFileSync(dailyCountsPath, 'utf-8')) as Record<string, Record<string, number>>;
      const today = new Date().toISOString().split('T')[0];
      const todayCounts = counts[today] ?? {};
      dau = Object.keys(todayCounts).length;
      totalMessages = Object.values(todayCounts).reduce((s, n) => s + n, 0);
      activeDays = Object.keys(counts).length;

      // 7-day retention: users active in last 7 days who were also active 7+ days ago
      const dates = Object.keys(counts).sort().reverse();
      const recent7 = new Set<string>();
      const older = new Set<string>();
      for (const date of dates) {
        const dayDiff = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
        for (const userId of Object.keys(counts[date])) {
          if (dayDiff <= 7) recent7.add(userId);
          if (dayDiff > 7) older.add(userId);
        }
      }
      const returning = Array.from(recent7).filter(u => older.has(u)).length;
      retention7d = older.size > 0 ? Math.round((returning / older.size) * 100) : 0;
      returningUsers = returning;
    } catch { /* daily-counts.json not available */ }

    return send(res, 200, {
      timestamp: new Date().toISOString(),
      uptime_s: Math.floor((Date.now() - START_TIME) / 1000),
      users: {
        total: stats.users ?? 0,
        dau,
        returning: returningUsers,
        retention_7d_pct: retention7d,
      },
      messages: {
        today: totalMessages,
        total_turns: stats.total_turns ?? 0,
        active_days: activeDays,
      },
      feedback: {
        total: feedback.total,
        average: feedback.average,
        nps: feedback.nps,
        recent_avg: feedback.recentAvg,
      },
      errors: {
        total: errors.total,
        last_24h: errors.last24h,
        by_type: errors.byType,
      },
      cached_handlers: handlerCache.size,
    });
  }

  // GET /stats
  if (method === 'GET' && url === '/stats') {
    const stats = memStore.getStats();
    return send(res, 200, { ...stats, uptime_s: Math.floor((Date.now() - START_TIME) / 1000) });
  }

  // GET /summary/:userId — Sprint 302: conversation summary
  if (method === 'GET' && url.startsWith('/summary/')) {
    const userId = decodeURIComponent(url.slice('/summary/'.length));
    if (!userId) return send(res, 400, { error: 'userId required' });
    const summary = loadSummary(userId);
    console.log('[Achiri API] /summary userId=' + userId + ' facts=' + (summary?.facts.length ?? 0));
    return send(res, 200, summary ?? { userId, facts: [], total_turns_summarized: 0, last_updated: null });
  }

  // GET /profile/:userId — Sprint 301: user profile extraction
  if (method === 'GET' && url.startsWith('/profile/')) {
    const userId = decodeURIComponent(url.slice('/profile/'.length));
    if (!userId) return send(res, 400, { error: 'userId required' });
    const profile = extractUserProfile(userId);
    console.log('[Achiri API] /profile userId=' + userId + ' lang=' + profile.preferred_language + ' interests=' + profile.top_interests.length);
    return send(res, 200, profile);
  }

  // GET /export/:userId — Sprint 313: conversation export for quality review
  if (method === 'GET' && url.startsWith('/export/')) {
    const userId = decodeURIComponent(url.slice('/export/'.length));
    if (!userId) return send(res, 400, { error: 'userId required' });
    const history = memStore.loadHistory(userId);
    const profile = extractUserProfile(userId);
    const summary = loadSummary(userId);
    console.log('[Achiri API] /export userId=' + userId + ' turns=' + history.length);
    return send(res, 200, {
      userId,
      turns: history.length,
      profile: {
        preferred_language: profile.preferred_language,
        top_interests: profile.top_interests,
        message_count: profile.message_count,
      },
      summary_facts: summary?.facts ?? [],
      conversation: history.map((t, i) => ({
        index: i,
        role: t.role,
        content: t.content,
      })),
    });
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
      trackError({ type: 'voice_error', userId, message: err instanceof Error ? err.message.slice(0, 200) : String(err) });
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
      const chatStart = Date.now();
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
        trackError({ type: 'limit_exceeded', userId, message: 'Daily limit reached for tier ' + tier });
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
      const responseTimeMs = Date.now() - chatStart;
      console.log('[Achiri API] /chat userId=' + userId + ' tier=' + tier + ' turns_after=' + turns + ' ms=' + responseTimeMs);

      // Sprint 643: log to Supabase event bus (non-blocking, fire-and-forget)
      publishAchiriChat({
        userId, tier, model: modelConfig.model, provider: modelConfig.provider,
        messageLength: message.length, responseTimeMs, turnsInMemory: turns,
      }).catch(() => {});

      return send(res, 200, {
        reply,
        turns_in_memory: turns,
        model: modelConfig.model,
        provider: modelConfig.provider,
        tier: modelConfig.tier,
      });
    } catch (err) {
      console.error('[Achiri API] /chat error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const errType = errMsg.includes('abort') || errMsg.includes('timeout') ? 'timeout' as const : 'llm_error' as const;
      trackError({ type: errType, userId, message: errMsg.slice(0, 200) });
      return send(res, 500, { error: 'internal error' });
    }
  }

  // POST /webhook/paymee — Sprint 622: payment confirmation webhook
  // PayMee sends: { payment_ref, order_id, amount, payment_status }
  // On success: persist user tier upgrade
  if (method === 'POST' && url === '/webhook/paymee') {
    let body: { payment_ref?: string; order_id?: string; amount?: number; payment_status?: number };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid JSON' });
    }
    const { order_id, payment_status } = body;
    console.log('[Achiri API] /webhook/paymee order=' + order_id + ' status=' + payment_status);

    // payment_status: 1 = success (PayMee convention)
    if (payment_status !== 1 || !order_id) {
      return send(res, 200, { received: true, action: 'ignored', reason: 'non-success status or missing order_id' });
    }

    // Extract tier and userId from order_id format: ACH-BASIC-ts-rand or ACH-PREMIUM-ts-rand
    const tierMatch = order_id.match(/^ACH-(BASIC|PREMIUM)-/i);
    if (!tierMatch) {
      console.warn('[Achiri API] /webhook/paymee unrecognized order_id format:', order_id);
      return send(res, 200, { received: true, action: 'ignored', reason: 'unrecognized order format' });
    }

    const tierName = tierMatch[1].toLowerCase() === 'basic' ? 'tnd_basic' : 'tnd_premium';

    // PayMee doesn't include userId in webhook — look it up from paymee checkout logs
    // For now, log the upgrade and the operator can map it via order_id
    // Future: store order_id → userId mapping at checkout time
    const logPath = require('path').join(__dirname, '..', '..', 'workspace', 'achiri', 'payment-log.jsonl');
    const entry = JSON.stringify({ ...body, tier: tierName, processed_at: new Date().toISOString() });
    try {
      const dir = require('path').dirname(logPath);
      if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
      require('fs').appendFileSync(logPath, entry + '\n', 'utf8');
    } catch (err) {
      console.error('[Achiri API] payment log write error:', err);
    }

    console.log('[Achiri API] /webhook/paymee PAID tier=' + tierName + ' order=' + order_id);
    return send(res, 200, { received: true, action: 'logged', tier: tierName, order_id });
  }

  // GET /tier/:userId — Sprint 622: check user's current tier
  if (method === 'GET' && url.startsWith('/tier/')) {
    const userId = decodeURIComponent(url.slice('/tier/'.length));
    if (!userId) return send(res, 400, { error: 'userId required' });
    const tier = getUserTier(userId);
    return send(res, 200, { userId, tier });
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log('[Achiri API] listening on port ' + PORT);
  console.log('[Achiri API] routes: POST /chat, POST /voice, GET /upgrade, POST /webhook/paymee, GET /tier/:userId, GET /summary/:userId, GET /profile/:userId, GET /export/:userId, DELETE /memory/:userId, GET /analytics, GET /stats, GET /health');
});

export { server };
