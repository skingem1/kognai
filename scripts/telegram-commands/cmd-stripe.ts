/**
 * Telegram bot commands — Stripe billing, checkout, subscribers, funnel.
 * Extracted from telegram-bot.ts (Sprint 496).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';
import { sendMessage } from './telegram-api';
import { ROOT, readLines, findCaptionedMp4 } from './shared';

export async function cmdCheckout(chatId: string, args: string): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    await sendMessage(chatId, '⚠️ *Stripe not configured.* Set `STRIPE_SECRET_KEY` in .env');
    return;
  }

  const tier = args.trim().toLowerCase() || 'growth';
  const priceMap: Record<string, { priceId: string; name: string; amount: string }> = {
    growth: {
      priceId: process.env.STRIPE_PRICE_GROWTH || '',
      name: 'Growth',
      amount: '€19/mo',
    },
    premium: {
      priceId: process.env.STRIPE_PRICE_PREMIUM || '',
      name: 'Premium',
      amount: '€49/mo',
    },
  };

  const plan = priceMap[tier];
  if (!plan) {
    await sendMessage(chatId, `❌ Unknown tier: \`${tier}\`\n\nUsage: \`/checkout growth\` or \`/checkout premium\``);
    return;
  }
  if (!plan.priceId) {
    await sendMessage(chatId, `⚠️ Price ID not configured for ${plan.name}. Set \`STRIPE_PRICE_${tier.toUpperCase()}\` in .env`);
    return;
  }

  const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://kognai.com/success';
  const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://kognai.com/cancel';

  const body = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': plan.priceId,
    'line_items[0][quantity]': '1',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
  }).toString();

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.stripe.com',
        path: '/v1/checkout/sessions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Stripe parse error: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Stripe API timeout')); });
      req.write(body);
      req.end();
    });

    if (result.error) {
      await sendMessage(chatId, `❌ Stripe error: ${result.error.message ?? JSON.stringify(result.error).slice(0, 200)}`);
      return;
    }

    const url = result.url;
    if (!url) {
      await sendMessage(chatId, `⚠️ No checkout URL returned. Response: ${JSON.stringify(result).slice(0, 300)}`);
      return;
    }

    const mode = stripeKey.startsWith('sk_live_') ? '🟢 LIVE' : '🟡 TEST';

    await sendMessage(chatId, [
      `💳 *${plan.name} Checkout* (${plan.amount}) ${mode}`,
      '',
      `🔗 ${url}`,
      '',
      `Session: \`${result.id?.slice(0, 30) ?? 'n/a'}\``,
      `Expires: ${result.expires_at ? new Date(result.expires_at * 1000).toISOString().slice(0, 16) : '24h'}`,
      '',
      '_Share this link with the subscriber. It expires in ~24h._',
    ].join('\n'));

  } catch (err: any) {
    await sendMessage(chatId, `❌ Checkout failed: ${err.message?.slice(0, 200)}`);
  }
}

export async function cmdSubscribers(chatId: string): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    await sendMessage(chatId, '⚠️ *Stripe not configured.* Set `STRIPE_SECRET_KEY` in .env');
    return;
  }

  try {
    const query = new URLSearchParams({
      status: 'active',
      limit: '100',
      'expand[]': 'data.customer',
    }).toString();

    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.stripe.com',
        path: `/v1/subscriptions?${query}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
        },
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Stripe parse error: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Stripe API timeout')); });
      req.end();
    });

    if (result.error) {
      await sendMessage(chatId, `❌ Stripe error: ${result.error.message ?? JSON.stringify(result.error).slice(0, 200)}`);
      return;
    }

    const subs = result.data ?? [];
    const mode = stripeKey.startsWith('sk_live_') ? '🟢 LIVE' : '🟡 TEST';

    if (subs.length === 0) {
      await sendMessage(chatId, `👥 *Subscribers* ${mode}\n\nNo active subscriptions yet.\n\nUse \`/checkout growth\` or \`/checkout premium\` to generate payment links.`);
      return;
    }

    let mrrCents = 0;
    const planCounts: Record<string, number> = {};
    const subLines: string[] = [];

    for (const sub of subs) {
      const item = sub.items?.data?.[0];
      const amount = item?.price?.unit_amount ?? 0;
      const interval = item?.price?.recurring?.interval ?? 'month';
      const monthlyAmount = interval === 'year' ? Math.round(amount / 12) : amount;
      mrrCents += monthlyAmount;

      const planName = item?.price?.nickname ?? item?.price?.id?.slice(0, 20) ?? 'unknown';
      planCounts[planName] = (planCounts[planName] ?? 0) + 1;

      const customer = typeof sub.customer === 'object' ? sub.customer : null;
      const email = customer?.email ?? 'no email';
      const created = new Date(sub.created * 1000).toISOString().slice(0, 10);

      subLines.push(`• ${email} — ${planName} (€${(amount / 100).toFixed(0)}) since ${created}`);
    }

    const mrr = (mrrCents / 100).toFixed(2);
    const arr = ((mrrCents * 12) / 100).toFixed(0);

    const plans = Object.entries(planCounts)
      .map(([name, count]) => `${name}: ${count}`)
      .join(' · ');

    const lines = [
      `👥 *Subscribers* ${mode}`,
      '',
      `📊 Active: *${subs.length}* | MRR: *€${mrr}* | ARR: €${arr}`,
      `📋 ${plans}`,
      '',
      ...subLines.slice(0, 20),
    ];

    if (subs.length > 20) {
      lines.push(`\n_...and ${subs.length - 20} more_`);
    }

    const webhookEvents = loadRecentWebhookEvents(5);
    if (webhookEvents.length > 0) {
      lines.push('');
      lines.push('*Recent Stripe Events:*');
      for (const ev of webhookEvents) {
        const icon = ev.type === 'checkout.session.completed' ? '💰'
          : ev.type === 'invoice.paid' ? '💳'
          : ev.type === 'customer.subscription.deleted' ? '⚠️'
          : '📋';
        const email = ev.email ?? 'unknown';
        const plan = ev.plan ? ` (${ev.plan})` : '';
        const amount = ev.amount ? ` $${ev.amount}` : '';
        const time = ev.logged_at ? ev.logged_at.split('T')[0] : '?';
        const typeLabel = ev.type?.split('.').pop()?.replace(/_/g, ' ') ?? ev.type ?? 'event';
        lines.push(`${icon} ${time} — ${typeLabel}: ${email}${plan}${amount}`);
      }
    }

    await sendMessage(chatId, lines.join('\n'));

  } catch (err: any) {
    await sendMessage(chatId, `❌ Subscribers fetch failed: ${err.message?.slice(0, 200)}`);
  }
}

function loadRecentWebhookEvents(limit: number): Array<Record<string, any>> {
  const logPath = path.join(ROOT, 'workspace', 'scs001', 'subscribers.jsonl');
  if (!fs.existsSync(logPath)) return [];
  try {
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
    const events: Array<Record<string, any>> = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return events.slice(-limit);
  } catch { return []; }
}

export function cmdPortal(args: string): string {
  const checkoutPort = process.env.CHECKOUT_PORT || '3002';
  const email = args.trim();

  if (!process.env.STRIPE_SECRET_KEY) {
    return '⚠️ Stripe not configured. Set `STRIPE_SECRET_KEY` in .env';
  }

  if (!email) {
    return (
      `🔗 *Billing Portal*\n\n` +
      `Generate a self-service link for a subscriber:\n\n` +
      `Usage: \`/portal user@example.com\`\n\n` +
      `The subscriber can manage their subscription, update payment, or cancel.\n\n` +
      `_Or direct link: \`http://localhost:${checkoutPort}/portal?email=<email>\`_`
    );
  }

  if (!email.includes('@') || !email.includes('.')) {
    return `❌ Invalid email: \`${email}\`\n\nUsage: \`/portal user@example.com\``;
  }

  const portalUrl = `http://localhost:${checkoutPort}/portal?email=${encodeURIComponent(email)}`;
  return (
    `🔗 *Billing Portal Link*\n\n` +
    `Subscriber: ${email}\n` +
    `Link: ${portalUrl}\n\n` +
    `_Send this link to the subscriber. They can manage their subscription, update payment method, or cancel._`
  );
}

export function cmdFunnel(): string {
  const experiments = readLines(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const totalExp = experiments.length;

  const qcPassed = experiments.filter((e: any) => e.qc_passed === true);
  const qcCount = qcPassed.length;

  const ledger = readLines(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const ledgerCount = ledger.length;

  let captionedCount = 0;
  try {
    const scsDir = path.join(ROOT, 'workspace', 'scs001');
    const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
    const seen = new Set<string>();
    for (const dir of runDirs) {
      const capDir = path.join(scsDir, dir, 'caption');
      if (!fs.existsSync(capDir)) continue;
      for (const f of fs.readdirSync(capDir)) {
        if (f.endsWith('-captioned.mp4')) seen.add(f);
      }
    }
    captionedCount = seen.size;
  } catch { /* skip */ }

  const posts = readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const postedCount = posts.length;

  const over500 = posts.filter((p: any) => (p.views ?? 0) >= 500).length;

  const pct = (a: number, b: number) => b > 0 ? `${Math.round((a / b) * 100)}%` : '—';

  const maxWidth = 20;
  const maxVal = Math.max(totalExp, 1);
  const bar = (val: number) => {
    const len = Math.min(maxWidth, Math.max(1, Math.round((val / maxVal) * maxWidth)));
    return '█'.repeat(len) + '░'.repeat(maxWidth - len);
  };

  const GATE_DATE = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));

  const lines = [
    '🔬 *Content Pipeline Funnel*',
    '',
    `${bar(totalExp)} Experiments: *${totalExp}*`,
    `${bar(qcCount)} QC Passed: *${qcCount}* (${pct(qcCount, totalExp)})`,
    `${bar(ledgerCount)} In Ledger: *${ledgerCount}* (${pct(ledgerCount, qcCount)})`,
    `${bar(captionedCount)} Captioned: *${captionedCount}* (${pct(captionedCount, ledgerCount)})`,
    `${bar(postedCount)} Posted: *${postedCount}* (${pct(postedCount, captionedCount)})`,
    `${bar(over500)} Views ≥500: *${over500}* (${pct(over500, postedCount)})`,
    '',
    `🎯 Gate: ${postedCount}/30 posts · ${over500}/30 with 500+ views · ${daysLeft}d left`,
    '',
    `📊 Overall: ${pct(postedCount, totalExp)} experiment→posted`,
    captionedCount > postedCount
      ? `💡 ${captionedCount - postedCount} videos ready — use /postnow`
      : '',
  ].filter(Boolean);

  return lines.join('\n');
}

export function cmdAchiri(): string {
  const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
  const waitlistPath = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');

  let waitlistCount = 0;
  if (fs.existsSync(waitlistPath)) {
    waitlistCount = fs.readFileSync(waitlistPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }

  if (!fs.existsSync(readinessPath)) {
    return (
      `🤖 *Achiri Alpha Status*\n\n` +
      `❌ No readiness report found.\n` +
      `Run: \`npx ts-node scripts/achiri/achiri-readiness.ts\`\n\n` +
      `📋 Waitlist: ${waitlistCount} users`
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(readinessPath, 'utf-8'));
    const checks: Array<{ name: string; pass: boolean; detail: string; critical: boolean }> = data.checks ?? [];

    const passCount = checks.filter(c => c.pass).length;
    const critFails = checks.filter(c => !c.pass && c.critical);

    const statusIcon = data.overall_ready ? '✅' : '⚠️';
    const lines: string[] = [
      `🤖 *Achiri Alpha Status* ${statusIcon}`,
      '',
      `📅 Alpha launch: ${data.alpha_date ?? '?'} (${data.days_to_alpha ?? '?'}d)`,
      `📊 Readiness: *${data.score ?? '?'}%* (${passCount}/${checks.length} checks pass)`,
      `📋 Waitlist: *${waitlistCount}* users`,
      '',
    ];

    if (critFails.length > 0) {
      lines.push('*🔴 Critical Failures:*');
      for (const c of critFails) {
        lines.push(`  ❌ ${c.name}: ${c.detail}`);
      }
      lines.push('');
    }

    lines.push('*Checks:*');
    for (const c of checks) {
      const icon = c.pass ? '✅' : '❌';
      const crit = c.critical ? ' ⚡' : '';
      lines.push(`  ${icon} ${c.name}${crit}`);
    }
    lines.push('');

    const tgToken = process.env.ACHIRI_TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET';
    lines.push(`*Telegram Bot:* ${tgToken === 'SET' ? '✅' : '⚠️'} Token: ${tgToken}`);

    lines.push('');
    lines.push(`_Report: ${data.generated_at ? data.generated_at.split('T')[0] : 'unknown'}_`);

    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading Achiri readiness: ${e.message}`;
  }
}

/**
 * /alpha — Sprint 985: Alpha launch readiness report with gate countdowns
 * Reads reports/achiri-alpha-report.json (generated by scripts/achiri/alpha-report.ts)
 */
export function cmdAlpha(): string {
  const reportPath = path.join(ROOT, 'reports', 'achiri-alpha-report.json');

  if (!fs.existsSync(reportPath)) {
    return (
      `🎯 *Alpha Launch Report*\n\n` +
      `❌ No report found.\n` +
      `Run: \`npx ts-node scripts/achiri/alpha-report.ts\``
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const verdictIcon = data.verdict === 'GO' ? '🟢' : data.verdict === 'AT-RISK' ? '🟡' : '🔴';

    const lines: string[] = [
      `🎯 *Alpha Launch Report* ${verdictIcon} *${data.verdict}*`,
      '',
      `📅 Launch: ${data.launchDate} (*${data.daysToLaunch}d* remaining)`,
      `👥 Waitlist: *${data.waitlistCount}* | Whitelist: *${data.whitelistCount}*`,
      `🤖 Bot: ${data.botHealthy ? '✅ online' : '❌ offline'}`,
      `🧪 Tests: ${data.readinessPassRate}`,
      '',
    ];

    if (data.gates?.length > 0) {
      lines.push('*📅 Gates:*');
      for (const g of data.gates) {
        const icon = g.status === 'pass' ? '✅' : g.status === 'overdue' ? '🚫' : '⏳';
        const days = g.daysRemaining > 0 ? `${g.daysRemaining}d` : g.status === 'pass' ? 'done' : 'OVERDUE';
        lines.push(`  ${icon} ${g.name} (${days})`);
      }
      lines.push('');
    }

    if (data.blockers?.length > 0) {
      lines.push(`*🚧 Blockers (${data.blockers.length}):*`);
      for (const b of data.blockers) {
        lines.push(`  • ${b}`);
      }
      lines.push('');
    }

    lines.push(`_Generated: ${data.generated?.split('T')[0] ?? 'unknown'}_`);
    return lines.join('\n');
  } catch (e: any) {
    return `❌ Error reading alpha report: ${e.message}`;
  }
}

/**
 * /test-stripe — Run comprehensive Stripe payment flow test
 * Sprint 470: Tests key, prices, checkout, subscriptions, portal, webhooks
 */
export async function cmdTestStripe(chatId: string): Promise<void> {
  await sendMessage(chatId, '🔄 Running Stripe payment flow test...');

  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    await sendMessage(chatId, '❌ *Stripe not configured*\n\nSet `STRIPE_SECRET_KEY` in .env to run tests.');
    return;
  }

  const mode = stripeKey.startsWith('sk_live_') ? 'LIVE' : stripeKey.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';

  async function stripeGet(endpoint: string): Promise<{ ok: boolean; data: any }> {
    try {
      const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });
      return { ok: res.ok, data: await res.json() };
    } catch (e: any) {
      return { ok: false, data: { error: { message: e.message } } };
    }
  }

  const lines: string[] = [`*Stripe Flow Test* (${mode} mode)\n`];

  // 1. Balance
  const bal = await stripeGet('/balance');
  if (bal.ok) {
    const avail = bal.data.available?.[0];
    const amt = avail ? `${(avail.amount / 100).toFixed(2)} ${String(avail.currency).toUpperCase()}` : '0.00';
    lines.push(`✅ API Key: valid — Balance: ${amt}`);
  } else {
    lines.push(`❌ API Key: ${bal.data.error?.message || 'invalid'}`);
  }

  // 2. Price IDs
  const priceGrowth = process.env.STRIPE_PRICE_GROWTH || '';
  const pricePremium = process.env.STRIPE_PRICE_PREMIUM || '';
  for (const [name, pid] of [['Growth', priceGrowth], ['Premium', pricePremium]] as const) {
    if (!pid) { lines.push(`❌ ${name} Price: NOT SET`); continue; }
    const p = await stripeGet(`/prices/${pid}`);
    if (p.ok) {
      const amt = `${(p.data.unit_amount / 100).toFixed(2)} ${String(p.data.currency).toUpperCase()}`;
      lines.push(`✅ ${name}: ${amt}/${p.data.recurring?.interval || '?'} (${p.data.active ? 'active' : '⚠️ INACTIVE'})`);
    } else {
      lines.push(`❌ ${name}: invalid price ID`);
    }
  }

  // 3. Subscriptions
  const subs = await stripeGet('/subscriptions?limit=10');
  if (subs.ok) {
    const total = subs.data.data?.length || 0;
    const active = subs.data.data?.filter((s: any) => s.status === 'active').length || 0;
    lines.push(`✅ Subscriptions: ${total} total, ${active} active`);
  } else {
    lines.push(`❌ Subscriptions: ${subs.data.error?.message || 'error'}`);
  }

  // 4. Billing Portal
  const portal = await stripeGet('/billing_portal/configurations?limit=1');
  if (portal.ok && portal.data.data?.length > 0) {
    lines.push(`✅ Billing Portal: configured`);
  } else {
    lines.push(`⚠️ Billing Portal: not configured`);
  }

  // 5. Webhooks
  const hooks = await stripeGet('/webhook_endpoints?limit=5');
  if (hooks.ok) {
    const active = hooks.data.data?.filter((e: any) => e.status === 'enabled').length || 0;
    lines.push(`${active > 0 ? '✅' : '⚠️'} Webhooks: ${active} active endpoint(s)`);
  } else {
    lines.push(`❌ Webhooks: ${hooks.data.error?.message || 'error'}`);
  }

  // 6. Webhook Secret
  lines.push(`${process.env.STRIPE_WEBHOOK_SECRET ? '✅' : '⚠️'} Webhook Secret: ${process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING'}`);

  await sendMessage(chatId, lines.join('\n'));
}

// Sprint 485: Usage metering command
export function cmdUsage(): string {
  try {
    const { getUsageSummary } = require('../../scripts/scs001/usage-meter');
    return getUsageSummary();
  } catch (err: any) {
    return `❌ Usage meter error: ${err.message}`;
  }
}

// Sprint 601: /achiridata — export Achiri analytics summary
export function cmdAchiriData(): string {
  try {
    const output = execSync(
      'npx ts-node --transpile-only scripts/achiri/export-analytics.ts',
      { cwd: ROOT, timeout: 15000, encoding: 'utf-8' }
    );
    const lines = output.trim().split('\n').filter(l => l.trim() && !l.startsWith('===') && !l.startsWith('Report:'));
    return ['📊 *Achiri Analytics Export*', '', ...lines, '', '_Full report: reports/achiri-analytics.json_'].join('\n');
  } catch (e: any) {
    return `❌ Analytics export failed: ${(e.message ?? '').slice(0, 200)}`;
  }
}

// Sprint 623: /waitlist — Achiri alpha waitlist management
const WAITLIST_PATH = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
const ALPHA_WHITELIST_PATH = path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');

interface WaitlistEntry {
  chatId: string;
  firstName: string;
  username: string;
  joinedAt: string;
}

function loadWaitlist(): WaitlistEntry[] {
  if (!fs.existsSync(WAITLIST_PATH)) return [];
  return fs.readFileSync(WAITLIST_PATH, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as WaitlistEntry[];
}

function loadWhitelist(): Set<string> {
  if (!fs.existsSync(ALPHA_WHITELIST_PATH)) return new Set();
  return new Set(
    fs.readFileSync(ALPHA_WHITELIST_PATH, 'utf-8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l).chatId; } catch { return null; } })
      .filter(Boolean) as string[]
  );
}

function approveUser(chatId: string): { ok: boolean; entry?: WaitlistEntry; error?: string } {
  const waitlist = loadWaitlist();
  const whitelist = loadWhitelist();

  if (whitelist.has(chatId)) return { ok: false, error: 'Already approved' };

  const entry = waitlist.find(w => w.chatId === chatId);
  if (!entry) return { ok: false, error: 'Not found on waitlist' };

  // Append to whitelist
  const dir = path.dirname(ALPHA_WHITELIST_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ALPHA_WHITELIST_PATH, JSON.stringify({
    chatId: entry.chatId,
    firstName: entry.firstName,
    username: entry.username,
    approvedAt: new Date().toISOString(),
  }) + '\n', 'utf-8');

  return { ok: true, entry };
}

export function cmdWaitlist(args: string): string {
  const parts = args.trim().split(/\s+/);
  const subCmd = parts[0]?.toLowerCase();

  // /waitlist approve <chatId>
  if (subCmd === 'approve' && parts[1]) {
    const result = approveUser(parts[1]);
    if (result.ok) {
      return `✅ *Approved:* ${result.entry!.firstName} (@${result.entry!.username || 'n/a'})\nChat ID: \`${result.entry!.chatId}\`\n\n_User can now access Achiri._`;
    }
    return `❌ ${result.error} (${parts[1]})`;
  }

  // /waitlist approve-all
  if (subCmd === 'approve-all') {
    const waitlist = loadWaitlist();
    const whitelist = loadWhitelist();
    const toApprove = waitlist.filter(w => !whitelist.has(w.chatId));
    if (toApprove.length === 0) return '✅ All waitlisted users are already approved.';

    let approved = 0;
    for (const entry of toApprove) {
      const result = approveUser(entry.chatId);
      if (result.ok) approved++;
    }
    return `✅ *Approved ${approved} users* from waitlist.\n\n_All waitlisted users now have alpha access._`;
  }

  // Default: show waitlist status
  const waitlist = loadWaitlist();
  const whitelist = loadWhitelist();
  const pending = waitlist.filter(w => !whitelist.has(w.chatId));

  const lines: string[] = [
    '📋 *Achiri Waitlist*',
    '',
    `Total: *${waitlist.length}* | Approved: *${whitelist.size}* | Pending: *${pending.length}*`,
    '',
  ];

  // Show last 10 pending
  if (pending.length > 0) {
    lines.push('*Recent pending:*');
    const recent = pending.slice(-10).reverse();
    for (const entry of recent) {
      const date = entry.joinedAt ? new Date(entry.joinedAt).toISOString().slice(0, 10) : '?';
      lines.push(`  • ${entry.firstName} (@${entry.username || 'n/a'}) — \`${entry.chatId}\` — ${date}`);
    }
    lines.push('');
    lines.push('_Commands:_');
    lines.push('/waitlist approve <chatId>');
    lines.push('/waitlist approve-all');
  } else {
    lines.push('✅ No pending users — all approved!');
  }

  return lines.join('\n');
}
