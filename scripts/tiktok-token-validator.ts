/**
 * tiktok-token-validator.ts — Sprint 593
 * Validates TikTok access token by checking metadata + making API call.
 *
 * Usage: npx ts-node scripts/tiktok-token-validator.ts
 * Returns JSON report with token status.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ROOT = path.resolve(__dirname, '..');

interface TokenReport {
  timestamp: string;
  has_client_keys: boolean;
  has_access_token: boolean;
  has_refresh_token: boolean;
  token_valid: boolean | null;
  expires_at: string | null;
  hours_until_expiry: number | null;
  refresh_expires_at: string | null;
  days_until_refresh_expiry: number | null;
  open_id: string | null;
  user_display_name: string | null;
  status: 'MISSING' | 'EXPIRED' | 'EXPIRING_SOON' | 'INVALID' | 'VALID' | 'NO_CLIENT_KEYS';
  action: string;
  error: string | null;
}

function fetchJSON(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

async function validateToken(): Promise<TokenReport> {
  const report: TokenReport = {
    timestamp: new Date().toISOString(),
    has_client_keys: false,
    has_access_token: false,
    has_refresh_token: false,
    token_valid: null,
    expires_at: null,
    hours_until_expiry: null,
    refresh_expires_at: null,
    days_until_refresh_expiry: null,
    open_id: null,
    user_display_name: null,
    status: 'MISSING',
    action: '',
    error: null,
  };

  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN || '';
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN || '';

  report.has_client_keys = !!(clientKey && clientSecret);
  report.has_access_token = !!accessToken;
  report.has_refresh_token = !!refreshToken;

  if (!clientKey || !clientSecret) {
    report.status = 'NO_CLIENT_KEYS';
    report.action = 'Add TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET to .env';
    return report;
  }

  if (!accessToken) {
    report.status = 'MISSING';
    report.action = 'Run: npx ts-node scripts/tiktok-oauth.ts (or /tiktokauth in Telegram)';
    return report;
  }

  // Check metadata for expiry
  const metaPath = path.join(ROOT, 'data', 'tiktok-token-meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.expires_at) {
        report.expires_at = meta.expires_at;
        const hoursLeft = Math.round((new Date(meta.expires_at).getTime() - Date.now()) / 3_600_000);
        report.hours_until_expiry = hoursLeft;

        if (hoursLeft <= 0) {
          report.status = 'EXPIRED';
          report.action = report.has_refresh_token
            ? 'Run: npx ts-node scripts/tiktok-refresh-token.ts'
            : 'Run: npx ts-node scripts/tiktok-oauth.ts (refresh token also expired)';
          return report;
        }

        if (hoursLeft <= 6) {
          report.status = 'EXPIRING_SOON';
          report.action = `Token expires in ${hoursLeft}h. Run: npx ts-node scripts/tiktok-refresh-token.ts`;
        }
      }
      if (meta.refresh_expires_at) {
        report.refresh_expires_at = meta.refresh_expires_at;
        report.days_until_refresh_expiry = Math.round(
          (new Date(meta.refresh_expires_at).getTime() - Date.now()) / 86_400_000
        );
      }
      report.open_id = meta.open_id ?? null;
    } catch { /* ignore metadata errors */ }
  }

  // Validate by calling TikTok API
  try {
    const data = await fetchJSON(
      'https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url',
      { Authorization: `Bearer ${accessToken}` }
    );

    if (data.error?.code && data.error.code !== 'ok') {
      report.token_valid = false;
      report.status = 'INVALID';
      report.error = data.error.message || data.error.code;
      report.action = 'Token is invalid. Run: npx ts-node scripts/tiktok-refresh-token.ts';
      return report;
    }

    report.token_valid = true;
    report.user_display_name = data.data?.user?.display_name ?? null;

    if (report.status !== 'EXPIRING_SOON') {
      report.status = 'VALID';
      report.action = 'Token is valid. Auto-posting is ready.';
    }
  } catch (err: any) {
    report.token_valid = false;
    report.error = err.message;
    report.status = 'INVALID';
    report.action = 'Token validation failed. Run: npx ts-node scripts/tiktok-refresh-token.ts';
  }

  return report;
}

function formatReport(r: TokenReport): string {
  const statusIcons: Record<string, string> = {
    VALID: '🟢', EXPIRING_SOON: '🟡', MISSING: '🔴',
    EXPIRED: '🔴', INVALID: '🔴', NO_CLIENT_KEYS: '🔴',
  };
  const icon = statusIcons[r.status] ?? '⚪';

  const lines = [
    `${icon} *TikTok Token Status: ${r.status}*`,
    '',
    `Client Keys: ${r.has_client_keys ? '✅' : '❌'}`,
    `Access Token: ${r.has_access_token ? '✅' : '❌'}`,
    `Refresh Token: ${r.has_refresh_token ? '✅' : '❌'}`,
  ];

  if (r.token_valid !== null) {
    lines.push(`API Validation: ${r.token_valid ? '✅ Valid' : '❌ Invalid'}`);
  }
  if (r.user_display_name) {
    lines.push(`Account: ${r.user_display_name}`);
  }
  if (r.hours_until_expiry !== null) {
    lines.push(`Expires: ${r.hours_until_expiry}h`);
  }
  if (r.days_until_refresh_expiry !== null) {
    lines.push(`Refresh Expires: ${r.days_until_refresh_expiry}d`);
  }
  if (r.error) {
    lines.push(`Error: ${r.error}`);
  }
  if (r.action) {
    lines.push('');
    lines.push(`_${r.action}_`);
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const report = await validateToken();

  // Write report
  const reportPath = path.join(ROOT, 'reports', 'token-health.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print formatted
  console.log(formatReport(report));
  console.log(`\nReport: reports/token-health.json`);
}

export { validateToken, formatReport, TokenReport };

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
