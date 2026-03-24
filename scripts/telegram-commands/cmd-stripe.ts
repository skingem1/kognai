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
    // Sprint 1120: days to alpha prominently in header
    const daysToAlpha = data.days_to_alpha ?? Math.max(0, Math.ceil((new Date('2026-04-25T00:00:00Z').getTime() - Date.now()) / 86_400_000));
    const alphaUrgency = daysToAlpha <= 3 ? '🔴' : daysToAlpha <= 7 ? '🟠' : daysToAlpha <= 14 ? '🟡' : '🟢';
    const lines: string[] = [
      `🤖 *Achiri Alpha Status* ${statusIcon}`,
      `${alphaUrgency} *${daysToAlpha}d to alpha launch* (${data.alpha_date ?? 'Apr 25'})`,
      '',
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

    // Sprint 1103: total messages + daily avg from daily-counts.json
    try {
      const countsPath = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
      if (fs.existsSync(countsPath)) {
        const counts = JSON.parse(fs.readFileSync(countsPath, 'utf-8')) as Record<string, Record<string, number>>;
        const days = Object.keys(counts).filter(d => !d.startsWith('validate') && !d.startsWith('e2e'));
        let totalMsgs = 0;
        let activeDays = 0;
        for (const [day, users] of Object.entries(counts)) {
          const dayMsgs = Object.entries(users)
            .filter(([k]) => !k.startsWith('validate') && !k.startsWith('e2e') && !k.endsWith('-limit') && !k.endsWith('-paid') && !k.endsWith('-bypass'))
            .reduce((s, [, v]) => s + (v as number), 0);
          if (dayMsgs > 0) { totalMsgs += dayMsgs; activeDays++; }
        }
        const avgPerDay = activeDays > 0 ? Math.round(totalMsgs / activeDays) : 0;
        // Sprint 1115: last 24h message count
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const last24hMsgs = [today, yesterday].reduce((s, d) => {
          const dayData = counts[d];
          if (!dayData) return s;
          return s + Object.entries(dayData)
            .filter(([k]) => !k.startsWith('validate') && !k.startsWith('e2e') && !k.endsWith('-limit') && !k.endsWith('-paid') && !k.endsWith('-bypass'))
            .reduce((sum, [, v]) => sum + (v as number), 0);
        }, 0);
        lines.push(`💬 *Messages:* ${totalMsgs} total · ${avgPerDay}/day avg · *${last24hMsgs} last 24h*`);

        // Sprint 1120: premium conversion rate
        const allUserKeys = new Set<string>();
        const paidUserKeys = new Set<string>();
        for (const dayData of Object.values(counts)) {
          for (const k of Object.keys(dayData)) {
            if (k.startsWith('validate') || k.startsWith('e2e')) continue;
            if (k.endsWith('-limit') || k.endsWith('-bypass')) continue;
            if (k.endsWith('-paid')) { paidUserKeys.add(k.replace('-paid', '')); continue; }
            allUserKeys.add(k);
          }
        }
        const totalUsers = allUserKeys.size;
        const premiumUsers = paidUserKeys.size;
        const convPct = totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 100) : 0;
        lines.push(`💎 *Premium:* ${premiumUsers}/${totalUsers} users = ${convPct}% conversion`);
        lines.push('');
      }
    } catch { /* skip */ }

    // Sprint 1074: Re-engagement stats
    const reengagePath = path.join(ROOT, 'workspace', 'achiri', 'reengage-log.jsonl');
    if (fs.existsSync(reengagePath)) {
      const reLines = fs.readFileSync(reengagePath, 'utf-8').split('\n').filter(l => l.trim());
      const today = new Date().toISOString().slice(0, 10);
      let todayCount = 0;
      for (const l of reLines) {
        try { if (JSON.parse(l).sentAt?.startsWith(today)) todayCount++; } catch {}
      }
      lines.push(`*Re-engagement:* ${todayCount} today / ${reLines.length} total`);
      lines.push('');
    }

    const tgToken = process.env.ACHIRI_TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET';
    lines.push(`*Telegram Bot:* ${tgToken === 'SET' ? '✅' : '⚠️'} Token: ${tgToken}`);

    lines.push('');
    lines.push(`_Report: ${data.generated_at ? data.generated_at.split('T')[0] : 'unknown'}_`);

    // Sprint 1067: Derja profiler test coverage
    lines.push('');
    lines.push('*Derja Profiler:*');
    try {
      const { execSync } = require('child_process');
      const out = execSync(
        `npx ts-node --transpile-only ${path.join(ROOT, 'scripts/achiri/validate-derja-profiler.ts')}`,
        { encoding: 'utf-8', timeout: 15000, cwd: ROOT }
      );
      const summaryLine = out.split('\n').find((l: string) => l.includes('ALL TESTS') || l.includes('FAIL'));
      if (summaryLine && summaryLine.includes('ALL TESTS PASSED')) {
        const match = summaryLine.match(/(\d+)\/(\d+)/);
        lines.push(`  ✅ ${match ? `${match[1]}/${match[2]} tests pass` : 'All tests pass'}`);
      } else if (summaryLine) {
        lines.push(`  ❌ ${summaryLine.trim().slice(0, 80)}`);
      } else {
        lines.push(`  ⚠️ Could not parse output`);
      }
    } catch (e: any) {
      lines.push(`  ❌ Runner failed: ${String(e.message ?? e).slice(0, 80)}`);
    }

    // Sprint 1074 + 1092: Re-engagement count + failure rate today vs yesterday
    lines.push('');
    lines.push('*Re-engagement:*');
    try {
      const reengagePath = path.join(ROOT, 'workspace', 'achiri', 'reengage-log.jsonl');
      const reengageErrPath = path.join(ROOT, 'logs', 'achiri-reengage-error.log');
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      let todayCount = 0, yesterdayCount = 0;
      if (fs.existsSync(reengagePath)) {
        const entries = fs.readFileSync(reengagePath, 'utf-8').trim().split('\n')
          .filter(Boolean).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        todayCount = entries.filter((e: any) => (e.sentAt ?? '').startsWith(today)).length;
        yesterdayCount = entries.filter((e: any) => (e.sentAt ?? '').startsWith(yesterday)).length;
      }

      // Sprint 1092: count failures from reengage error log
      let todayFail = 0, yesterdayFail = 0;
      if (fs.existsSync(reengageErrPath)) {
        const errContent = fs.readFileSync(reengageErrPath, 'utf-8');
        for (const line of errContent.split('\n')) {
          if (line.includes('Telegram error') || line.includes('error')) {
            if (line.startsWith(today)) todayFail++;
            else if (line.startsWith(yesterday)) yesterdayFail++;
          }
        }
      }

      const todayStr = todayFail > 0 ? `*${todayCount}* sent · ❌${todayFail} failed` : `*${todayCount}* sent`;
      const ydStr = yesterdayFail > 0 ? `${yesterdayCount} sent · ${yesterdayFail} failed` : `${yesterdayCount} sent`;
      lines.push(`  📤 Today: ${todayStr} · Yesterday: ${ydStr}`);
    } catch {
      lines.push(`  _could not read reengage log_`);
    }

    // Sprint 1121 (wave 12): test suite pass rate from achiri-test-suite.json
    try {
      const testSuitePath = path.join(ROOT, 'reports', 'achiri-test-suite.json');
      if (fs.existsSync(testSuitePath)) {
        const ts = JSON.parse(fs.readFileSync(testSuitePath, 'utf-8'));
        const totalTests = ts.total ?? ts.tests?.length ?? 0;
        const passed = ts.passed ?? ts.pass ?? ts.tests?.filter((t: any) => t.pass || t.status === 'pass').length ?? 0;
        const failed = totalTests - passed;
        const pct = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0;
        const icon = failed === 0 ? '✅' : failed <= 2 ? '⚠️' : '❌';
        lines.push('');
        lines.push(`🧪 *Test Suite:* ${icon} ${passed}/${totalTests} pass (${pct}%)${failed > 0 ? ` · ${failed} failing` : ''}`);
      }
    } catch { /* skip */ }

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

    // Sprint 1082: inline pre-alpha readiness checks from achiri-readiness.json
    try {
      const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
      if (fs.existsSync(readinessPath)) {
        const rd = JSON.parse(fs.readFileSync(readinessPath, 'utf-8'));
        const checks: any[] = rd.checks ?? [];
        const passing = checks.filter((c: any) => c.pass).length;
        lines.push(`*🔍 Pre-Alpha Checks (${passing}/${checks.length} pass):*`);
        for (const c of checks) {
          const icon = c.pass ? '✅' : '❌';
          const crit = c.critical ? ' ⭐' : '';
          lines.push(`  ${icon}${crit} ${c.name} — ${(c.detail ?? '').slice(0, 60)}`);
        }
        lines.push('');
      }
    } catch { /* skip */ }

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

// Sprint 1063: /stripe — last 5 Stripe events + webhook health
export async function cmdStripe(): Promise<string> {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) {
    return '💳 *Stripe Events*\n\n⚠️ `STRIPE_SECRET_KEY` not set.\n\n' + stripeLogFallback();
  }

  const mode = stripeKey.startsWith('sk_live_') ? '🟢 LIVE' : '🟡 TEST';

  try {
    // Fetch last 5 events from Stripe API
    const eventsResult = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.stripe.com',
        path: '/v1/events?limit=5',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('parse error')); } });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    if (eventsResult.error) {
      return `💳 *Stripe Events* ${mode}\n\n❌ ${eventsResult.error.message ?? 'API error'}\n\n` + stripeLogFallback();
    }

    const events: any[] = eventsResult.data ?? [];
    const lines: string[] = [`💳 *Stripe Events* ${mode}`, ''];

    if (events.length === 0) {
      lines.push('_No recent events._');
    } else {
      lines.push('*Last 5 events:*');
      for (const ev of events) {
        const time = new Date(ev.created * 1000).toISOString().replace('T', ' ').slice(0, 16);
        const type = ev.type ?? 'unknown';
        const icon = type.includes('succeeded') || type.includes('completed') ? '✅'
          : type.includes('failed') || type.includes('deleted') ? '❌'
          : type.includes('created') ? '🆕'
          : type.includes('updated') ? '🔄'
          : '📋';
        lines.push(`${icon} \`${time}\` — ${type}`);
      }
    }

    // Webhook log tail
    lines.push('');
    lines.push(stripeLogFallback());

    return lines.join('\n');
  } catch (err: any) {
    return `💳 *Stripe Events*\n\n❌ Fetch failed: ${(err.message ?? '').slice(0, 200)}\n\n` + stripeLogFallback();
  }
}

function stripeLogFallback(): string {
  const logPath = path.join(ROOT, 'logs', 'stripe-webhook-out.log');
  if (!fs.existsSync(logPath)) return '_Webhook log: not found_';
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const last5 = lines.slice(-5);
    const stat = fs.statSync(logPath);
    const age = Math.round((Date.now() - stat.mtimeMs) / 3600000);
    return `*Webhook log* (last update: ${age}h ago):\n` + last5.map(l => `\`${l.slice(0, 80)}\``).join('\n');
  } catch { return '_Webhook log: unreadable_'; }
}

// Sprint 1128: /deploy-status — Achiri alpha deploy checklist
export function cmdDeployStatus(): string {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // 1. Supabase connection
  checks.push({
    name: 'Supabase URL',
    pass: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    detail: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
  });

  // 2. Telegram bot running
  const botRunning = (() => {
    try {
      const procs = JSON.parse(execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }));
      return procs.some((p: any) => p.name === 'telegram-bot' && p.pm2_env?.status === 'online');
    } catch { return false; }
  })();
  checks.push({ name: 'Telegram bot', pass: botRunning, detail: botRunning ? 'online' : 'offline' });

  // 3. Achiri readiness report
  const readinessPath = path.join(ROOT, 'reports', 'achiri-readiness.json');
  const hasReadiness = fs.existsSync(readinessPath);
  let readinessScore = 0;
  if (hasReadiness) {
    try { readinessScore = JSON.parse(fs.readFileSync(readinessPath, 'utf-8')).score ?? 0; } catch {}
  }
  checks.push({ name: 'Readiness report', pass: hasReadiness && readinessScore >= 70, detail: hasReadiness ? `${readinessScore}%` : 'not generated' });

  // 4. Whitelist exists and has entries
  const wlPath = path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');
  let wlCount = 0;
  if (fs.existsSync(wlPath)) {
    wlCount = fs.readFileSync(wlPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }
  checks.push({ name: 'Alpha whitelist', pass: wlCount > 0, detail: `${wlCount} users` });

  // 5. Waitlist exists
  const waitPath = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
  let waitCount = 0;
  if (fs.existsSync(waitPath)) {
    waitCount = fs.readFileSync(waitPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }
  checks.push({ name: 'Waitlist', pass: waitCount > 0, detail: `${waitCount} users` });

  // 6. Voice validation
  const voicePath = path.join(ROOT, 'workspace', 'achiri', 'voice-validation-checklist.md');
  checks.push({ name: 'Voice validation', pass: fs.existsSync(voicePath), detail: fs.existsSync(voicePath) ? 'done' : 'missing' });

  // 7. Daily counts tracking
  const countsPath = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
  checks.push({ name: 'Usage tracking', pass: fs.existsSync(countsPath), detail: fs.existsSync(countsPath) ? 'active' : 'not set up' });

  // 8. ELEVENLABS for TTS
  checks.push({ name: 'ElevenLabs TTS', pass: !!process.env.ELEVENLABS_API_KEY, detail: process.env.ELEVENLABS_API_KEY ? 'SET' : 'MISSING' });

  const passCount = checks.filter(c => c.pass).length;
  const allPass = passCount === checks.length;
  const daysToAlpha = Math.max(0, Math.ceil((new Date('2026-04-25T00:00:00Z').getTime() - Date.now()) / 86_400_000));

  const lines = [
    `🚀 *Achiri Alpha Deploy Status* ${allPass ? '✅' : '⚠️'}`,
    `📅 *${daysToAlpha}d* to launch (Apr 25) · ${passCount}/${checks.length} checks pass`,
    '',
  ];

  for (const c of checks) {
    lines.push(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  if (!allPass) {
    lines.push('');
    lines.push('_Fix ❌ items before launch. Run /achiri for full status._');
  } else {
    lines.push('');
    lines.push('✅ *All checks pass — ready to launch!*');
  }

  return lines.join('\n');
}

// Sprint 1128: /invite-achiri — add user to alpha whitelist
export function cmdInviteAchiri(args: string): string {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 1 || !parts[0]) {
    return (
      `*Usage:* \`/invite-achiri <chat_id> [name] [username]\`\n\n` +
      `Adds a user to the Achiri alpha whitelist.\n` +
      `Example: \`/invite-achiri 123456789 Ahmed @ahmed\`\n\n` +
      `Current whitelist: /deploy-status`
    );
  }

  const chatId = parts[0];
  if (!/^\d+$/.test(chatId)) {
    return `❌ Invalid chat ID: \`${chatId}\` — must be numeric.`;
  }

  const firstName = parts[1] || 'Unknown';
  const username = parts[2] || '';

  const wlPath = path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');

  // Check for duplicate
  if (fs.existsSync(wlPath)) {
    const existing = fs.readFileSync(wlPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of existing) {
      try {
        const entry = JSON.parse(line);
        if (entry.chatId === chatId) {
          return `⚠️ User \`${chatId}\` (${entry.firstName || 'unknown'}) is already on the whitelist.`;
        }
      } catch {}
    }
  }

  const entry = {
    chatId,
    firstName,
    username: username.replace(/^@/, ''),
    approvedAt: new Date().toISOString(),
  };

  fs.appendFileSync(wlPath, JSON.stringify(entry) + '\n');

  // Count total
  const total = fs.readFileSync(wlPath, 'utf-8').split('\n').filter(l => l.trim()).length;

  return (
    `✅ *Invited to Achiri Alpha*\n\n` +
    `👤 ${firstName}${username ? ` (@${username.replace(/^@/, '')})` : ''}\n` +
    `🆔 Chat ID: \`${chatId}\`\n` +
    `📋 Total whitelist: *${total}* users`
  );
}
