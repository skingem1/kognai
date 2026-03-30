/**
 * Kognai Waitlist Worker
 * Cloudflare Worker — stores email + wallet to KV namespace WAITLIST
 *
 * Deploy:
 *   1. wrangler kv:namespace create WAITLIST  → copy id into wrangler.toml
 *   2. wrangler deploy
 *
 * Routes handled:
 *   POST /api/waitlist   { email, wallet? }  → 201 Created
 *   GET  /api/waitlist   (admin only via ?secret=)  → 200 JSON array
 *   OPTIONS *            CORS preflight
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname !== '/api/waitlist') {
      return new Response('Not Found', { status: 404, headers: CORS });
    }

    // ── POST /api/waitlist ────────────────────────────────────────────────
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const email = (body.email || '').trim().toLowerCase();
      const wallet = (body.wallet || '').trim();

      if (!email || !isValidEmail(email)) {
        return json({ error: 'Valid email required' }, 400);
      }

      const existing = await env.WAITLIST.get(`email:${email}`);
      if (existing) {
        return json({ message: 'Already on the list', duplicate: true }, 200);
      }

      const entry = {
        email,
        wallet: wallet || null,
        joined_at: new Date().toISOString(),
        source: request.headers.get('Referer') || 'direct',
        ip: request.headers.get('CF-Connecting-IP') || null,
        country: request.cf?.country || null,
      };

      // Primary key: email dedup
      await env.WAITLIST.put(`email:${email}`, JSON.stringify(entry));

      // Count key for quick total
      const countStr = await env.WAITLIST.get('_count') || '0';
      await env.WAITLIST.put('_count', String(parseInt(countStr) + 1));

      console.log(`[waitlist] New signup: ${email} | wallet: ${wallet || 'none'} | country: ${entry.country}`);

      return json({ message: 'Welcome to the Founding Circle.' }, 201);
    }

    // ── GET /api/waitlist?secret=XXX (admin export) ───────────────────────
    if (request.method === 'GET') {
      const secret = url.searchParams.get('secret');
      if (!secret || secret !== env.ADMIN_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const count = await env.WAITLIST.get('_count') || '0';
      // List all keys — Cloudflare KV list (max 1000 per page)
      const list = await env.WAITLIST.list({ prefix: 'email:' });
      const entries = await Promise.all(
        list.keys.map(async k => {
          const val = await env.WAITLIST.get(k.name);
          return val ? JSON.parse(val) : null;
        })
      );
      return json({ count: parseInt(count), entries: entries.filter(Boolean) }, 200);
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
