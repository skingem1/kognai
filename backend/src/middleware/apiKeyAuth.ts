import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';

const API_KEY_PREFIX = 'sk_';

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface AuthedRequest extends Request {
  companyId?: string;
  apiKeyId?: string;
}

/**
 * Extracts the raw API key from Authorization: Bearer <key> or X-Api-Key header.
 */
function extractKey(req: Request): string | null {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const xKey = req.headers['x-api-key'];
  if (typeof xKey === 'string') return xKey.trim();
  return null;
}

/**
 * Middleware: validates API key against Supabase ApiKey table.
 * On success, attaches req.companyId and req.apiKeyId.
 * On failure, returns 401.
 */
export async function requireApiKey(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const rawKey = extractKey(req);

  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Missing or invalid API key. Use Authorization: Bearer sk_<key>',
        code: 'UNAUTHORIZED',
      },
    });
    return;
  }

  // First 8 hex chars after prefix = keyPrefix for fast lookup
  const keyPrefix = rawKey.slice(API_KEY_PREFIX.length, API_KEY_PREFIX.length + 8);

  const sb = getSb();
  const { data: rows, error } = await sb
    .from('ApiKey')
    .select('id, customerId, keyHash, isActive, expiresAt')
    .eq('keyPrefix', keyPrefix)
    .eq('isActive', true)
    .limit(5);

  if (error || !rows || rows.length === 0) {
    res.status(401).json({ success: false, error: { message: 'Invalid API key', code: 'UNAUTHORIZED' } });
    return;
  }

  // Find the matching row by bcrypt comparison
  let matched: typeof rows[0] | null = null;
  for (const row of rows) {
    try {
      const ok = await bcrypt.compare(rawKey, row.keyHash);
      if (ok) { matched = row; break; }
    } catch { /* skip */ }
  }

  if (!matched) {
    res.status(401).json({ success: false, error: { message: 'Invalid API key', code: 'UNAUTHORIZED' } });
    return;
  }

  // Check expiry
  if (matched.expiresAt && new Date(matched.expiresAt) < new Date()) {
    res.status(401).json({ success: false, error: { message: 'API key expired', code: 'KEY_EXPIRED' } });
    return;
  }

  // Attach company scope
  req.companyId = matched.customerId;
  req.apiKeyId  = matched.id;

  // Update lastUsedAt in background (fire and forget)
  (async () => { try { await sb.from('ApiKey').update({ lastUsedAt: new Date().toISOString() }).eq('id', matched.id); } catch {} })();

  next();
}
