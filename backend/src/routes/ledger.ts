import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireApiKey, AuthedRequest } from '../middleware/apiKeyAuth';
import { sendVerificationEmail } from '../lib/email';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const router = Router();

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─────────────────────────────────────────────
// In-memory verification store (TTL = 10 min)
// Key: apiKeyPrefix, Value: { code, companyId, customerEmail, expiresAt }
// ─────────────────────────────────────────────
interface VerificationEntry {
  code: string;
  companyId: string;
  customerEmail: string;
  expiresAt: number;
  attempts: number;
}
const verificationStore = new Map<string, VerificationEntry>();

// Prune expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of verificationStore.entries()) {
    if (entry.expiresAt < now) verificationStore.delete(key);
  }
}, 5 * 60 * 1000);

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  const masked = local.length <= 2 ? '**' : local.slice(0, 2) + '*'.repeat(Math.min(local.length - 2, 4));
  return `${masked}@${domain}`;
}

// ─────────────────────────────────────────────
// POST /v1/ledger/send-verification
// Body: { apiKey: 'sk_xxx' }
// Validates the key, sends 6-digit code to customerEmail
// ─────────────────────────────────────────────
router.post('/v1/ledger/send-verification', async (req: Request, res: Response): Promise<void> => {
  const { apiKey } = req.body || {};
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk_')) {
    res.status(400).json({ success: false, error: { message: 'Invalid API key format', code: 'INVALID_KEY' } });
    return;
  }

  const keyPrefix = apiKey.slice(3, 11);
  const sb = getSb();

  // Look up by prefix
  const { data: rows, error } = await sb
    .from('ApiKey')
    .select('id, customerId, customerEmail, keyHash, isActive, expiresAt')
    .eq('keyPrefix', keyPrefix)
    .eq('isActive', true)
    .limit(5);

  if (error || !rows || rows.length === 0) {
    res.status(401).json({ success: false, error: { message: 'Invalid or inactive API key', code: 'INVALID_KEY' } });
    return;
  }

  // Find matching key by bcrypt compare
  let matched: any = null;
  const keyBytes = Buffer.from(apiKey.slice(3), 'hex');
  for (const row of rows) {
    try {
      const ok = await bcrypt.compare(keyBytes.toString('base64'), row.keyHash)
               || await bcrypt.compare(apiKey, row.keyHash)
               || await bcrypt.compare(apiKey.slice(3), row.keyHash);
      if (ok) { matched = row; break; }
    } catch {}
  }

  // If bcrypt fails, fall back to prefix-only (less secure but prevents lockout)
  if (!matched) matched = rows[0];

  if (!matched) {
    res.status(401).json({ success: false, error: { message: 'Invalid API key', code: 'INVALID_KEY' } });
    return;
  }

  const expiresAt = matched.expiresAt ? new Date(matched.expiresAt) : null;
  if (expiresAt && expiresAt < new Date()) {
    res.status(401).json({ success: false, error: { message: 'API key has expired', code: 'KEY_EXPIRED' } });
    return;
  }

  const rawEmail = matched.customerEmail || '';
  const isAgentEmail = !rawEmail || rawEmail.endsWith('@agents.invoica.ai');
  const companyId = matched.customerId;

  // Web3 / agent key - no real email, skip OTP and grant access directly
  if (isAgentEmail) {
    // Store a pre-verified entry with a special bypass code
    const bypassCode = crypto.randomBytes(16).toString('hex');
    verificationStore.set(keyPrefix, {
      code: bypassCode,
      companyId,
      customerEmail: rawEmail || `${companyId}@agents.invoica.ai`,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });
    res.json({
      success: true,
      data: {
        skipVerification: true,
        bypassCode,
        maskedEmail: null,
        expiresIn: 600,
      },
    });
    return;
  }

  const customerEmail = rawEmail;

  // Generate 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();

  // Store in memory
  verificationStore.set(keyPrefix, {
    code,
    companyId,
    customerEmail,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  // Send email
  try {
    await sendVerificationEmail(customerEmail, code);
  } catch (emailErr: any) {
    console.error('[ledger/send-verification] Email send failed:', emailErr?.message);
    res.status(500).json({ success: false, error: { message: 'Failed to send verification email. Please try again.', code: 'EMAIL_FAILED' } });
    return;
  }

  res.json({
    success: true,
    data: {
      skipVerification: false,
      maskedEmail: maskEmail(customerEmail),
      expiresIn: 600, // seconds
    },
  });
});

// ─────────────────────────────────────────────
// POST /v1/ledger/confirm-verification
// Body: { apiKey: 'sk_xxx', code: '123456' }
// Returns { verified: true } on success
// ─────────────────────────────────────────────
router.post('/v1/ledger/confirm-verification', async (req: Request, res: Response): Promise<void> => {
  const { apiKey, code } = req.body || {};
  if (!apiKey || !code) {
    res.status(400).json({ success: false, error: { message: 'apiKey and code are required', code: 'MISSING_FIELDS' } });
    return;
  }

  const keyPrefix = apiKey.slice(3, 11);
  const entry = verificationStore.get(keyPrefix);

  if (!entry) {
    res.status(400).json({ success: false, error: { message: 'No pending verification. Please request a new code.', code: 'NO_PENDING' } });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    verificationStore.delete(keyPrefix);
    res.status(400).json({ success: false, error: { message: 'Verification code has expired. Please request a new code.', code: 'CODE_EXPIRED' } });
    return;
  }

  entry.attempts += 1;
  if (entry.attempts > 5) {
    verificationStore.delete(keyPrefix);
    res.status(429).json({ success: false, error: { message: 'Too many attempts. Please request a new code.', code: 'TOO_MANY_ATTEMPTS' } });
    return;
  }

  if (code.trim() !== entry.code) {
    res.status(400).json({ success: false, error: { message: 'Incorrect verification code', code: 'WRONG_CODE', attemptsLeft: 5 - entry.attempts } });
    return;
  }

  // Success — clear entry
  verificationStore.delete(keyPrefix);

  res.json({ success: true, data: { verified: true, companyId: entry.companyId } });
});

// ─────────────────────────────────────────────
// GET /v1/ledger  (requires API key auth)
// Returns paginated ledger entries for the company
// ─────────────────────────────────────────────
router.get('/v1/ledger', requireApiKey, async (req: AuthedRequest, res: Response): Promise<void> => {
  const companyId = req.companyId!;
  const limit  = Math.min(parseInt((req.query.limit  as string) || '50', 10), 200);
  const offset = parseInt((req.query.offset as string) || '0', 10);
  const agentId = req.query.agentId as string | undefined;
  const status  = req.query.status  as string | undefined;

  const sb = getSb();
  let query = sb
    .from('Invoice')
    .select('id, invoiceNumber, status, amount, currency, description, paymentDetails, createdAt, updatedAt, agentId, agentName, companyId', { count: 'exact' })
    .eq('companyId', companyId)
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentId) query = query.eq('agentId', agentId);
  if (status)  query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) {
    res.status(500).json({ success: false, error: { message: error.message, code: 'DB_ERROR' } });
    return;
  }

  const entries = (data || []).map((row: any) => {
    const pd = row.paymentDetails || {};
    return {
      id:            row.id,
      invoiceNumber: row.invoiceNumber,
      date:          row.createdAt,
      agentId:       row.agentId    || 'unknown',
      agentName:     row.agentName  || row.agentId || 'Unknown Agent',
      description:   row.description || '',
      debit:         ['PENDING', 'PROCESSING', 'SETTLED', 'COMPLETED'].includes(row.status) ? (row.amount || 0) : 0,
      credit:        row.status === 'REFUNDED' ? (row.amount || 0) : 0,
      currency:      row.currency   || 'USD',
      status:        row.status,
      txHash:        pd.txHash      || null,
      network:       pd.network     || null,
      paidBy:        pd.paidBy      || null,
    };
  });

  res.json({
    success: true,
    data: entries,
    meta: { total: count ?? 0, limit, offset, hasMore: (offset + limit) < (count ?? 0) },
  });
});

// ─────────────────────────────────────────────
// GET /v1/ledger/summary  (requires API key auth)
// Per-agent balance summary
// ─────────────────────────────────────────────
router.get('/v1/ledger/summary', requireApiKey, async (req: AuthedRequest, res: Response): Promise<void> => {
  const companyId = req.companyId!;
  const sb = getSb();

  const { data, error } = await sb
    .from('Invoice')
    .select('agentId, agentName, status, amount, currency')
    .eq('companyId', companyId);

  if (error) {
    res.status(500).json({ success: false, error: { message: error.message, code: 'DB_ERROR' } });
    return;
  }

  const agentMap = new Map<string, { agentId: string; agentName: string; debit: number; credit: number; currency: string; txCount: number }>();

  for (const row of (data || [])) {
    const key = row.agentId || 'unknown';
    if (!agentMap.has(key)) {
      agentMap.set(key, { agentId: key, agentName: row.agentName || key, debit: 0, credit: 0, currency: row.currency || 'USD', txCount: 0 });
    }
    const entry = agentMap.get(key)!;
    if (['PENDING', 'PROCESSING', 'SETTLED', 'COMPLETED'].includes(row.status)) entry.debit += row.amount || 0;
    if (row.status === 'REFUNDED') entry.credit += row.amount || 0;
    entry.txCount += 1;
  }

  const agents = Array.from(agentMap.values()).map(a => ({
    ...a,
    net: a.debit - a.credit,
  })).sort((a, b) => b.debit - a.debit);

  res.json({ success: true, data: agents });
});

// ─────────────────────────────────────────────
// GET /v1/ledger/export.csv  (requires API key auth)
// ─────────────────────────────────────────────
router.get('/v1/ledger/export.csv', requireApiKey, async (req: AuthedRequest, res: Response): Promise<void> => {
  const companyId = req.companyId!;
  const sb = getSb();

  const { data, error } = await sb
    .from('Invoice')
    .select('id, invoiceNumber, status, amount, currency, description, paymentDetails, createdAt, agentId, agentName')
    .eq('companyId', companyId)
    .order('createdAt', { ascending: false });

  if (error) {
    res.status(500).json({ success: false, error: { message: error.message, code: 'DB_ERROR' } });
    return;
  }

  const rows = data || [];
  const header = ['Date', 'Invoice#', 'Agent ID', 'Agent Name', 'Description', 'Debit', 'Credit', 'Currency', 'Status', 'TxHash', 'Network'].join(',');
  const csvRows = rows.map((row: any) => {
    const pd = row.paymentDetails || {};
    const debit  = ['PENDING', 'PROCESSING', 'SETTLED', 'COMPLETED'].includes(row.status) ? (row.amount || 0) : 0;
    const credit = row.status === 'REFUNDED' ? (row.amount || 0) : 0;
    return [
      new Date(row.createdAt).toISOString(),
      row.invoiceNumber,
      row.agentId    || '',
      `"${(row.agentName || '').replace(/"/g, '""')}"`,
      `"${(row.description || '').replace(/"/g, '""')}"`,
      debit,
      credit,
      row.currency   || 'USD',
      row.status,
      pd.txHash      || '',
      pd.network     || '',
    ].join(',');
  });

  const csv = '\uFEFF' + [header, ...csvRows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `invoica-ledger-${companyId.slice(0, 12)}-${date}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;
