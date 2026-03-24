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
        // Sprint 1136 (wave 13): last active user timestamp
        let lastActiveLine = '';
        try {
          const allDays = Object.keys(counts).sort();
          const latestDay = allDays[allDays.length - 1];
          if (latestDay) {
            const ageH = (Date.now() - new Date(latestDay).getTime()) / 3600000;
            const ageStr = ageH < 1 ? `${Math.round(ageH * 60)}m ago` : ageH < 24 ? `${Math.round(ageH)}h ago` : `${Math.round(ageH / 24)}d ago`;
            lastActiveLine = ` · last active: *${ageStr}*`;
          }
        } catch { /* skip */ }
        lines.push(`💬 *Messages:* ${totalMsgs} total · ${avgPerDay}/day avg · *${last24hMsgs} last 24h*${lastActiveLine}`);
        // Sprint 1138 (wave 16): last 7 days message trend sparkline
        try {
          const sparkChars = ['▁','▂','▃','▄','▅','▆','▇','█'];
          const last7: number[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
            const dayData = counts[d];
            const n = dayData ? Object.entries(dayData)
              .filter(([k]) => !k.startsWith('validate') && !k.startsWith('e2e') && !k.endsWith('-limit') && !k.endsWith('-paid') && !k.endsWith('-bypass'))
              .reduce((s, [, v]) => s + (v as number), 0) : 0;
            last7.push(n);
          }
          const maxVal = Math.max(...last7, 1);
          const spark = last7.map(n => sparkChars[Math.min(7, Math.floor((n / maxVal) * 7))]).join('');
          lines.push(`📈 *7d trend:* \`${spark}\` (${last7[last7.length - 1]} today)`);
        } catch { /* skip */ }

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
        // Sprint 1138 (wave 15): top 3 most active users (anonymized)
        const userMsgCounts = new Map<string, number>();
        for (const dayData of Object.values(counts)) {
          for (const [k, v] of Object.entries(dayData)) {
            if (k.startsWith('validate') || k.startsWith('e2e') || k.endsWith('-limit') || k.endsWith('-paid') || k.endsWith('-bypass')) continue;
            userMsgCounts.set(k, (userMsgCounts.get(k) ?? 0) + (v as number));
          }
        }
        const topUsers = Array.from(userMsgCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([uid, cnt], i) => `${['🥇','🥈','🥉'][i]} user_${uid.slice(-4)}: ${cnt} msgs`);
        if (topUsers.length > 0) {
          lines.push(`👤 *Top users:* ${topUsers.join(' · ')}`);
        }
        // Sprint 1135 (wave 14): conversion funnel: waitlist → active → premium
        const funnelWaitlist = waitlistCount;
        const funnelActive = totalUsers;
        const funnelPremium = premiumUsers;
        const w2a = funnelWaitlist > 0 ? Math.round((funnelActive / funnelWaitlist) * 100) : 0;
        const a2p = funnelActive > 0 ? Math.round((funnelPremium / funnelActive) * 100) : 0;
        // Sprint 1136 (wave 19): cold leads — waitlist users who never messaged
        try {
          const wlLines = fs.readFileSync(path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl'), 'utf-8').split('\n').filter(l => l.trim());
          const msgUsers = new Set<string>(Array.from(allUserKeys));
          let coldLeads = 0;
          for (const l of wlLines) {
            try {
              const w = JSON.parse(l);
              const uid = w.uid ?? w.telegram_id ?? w.id;
              if (uid && !msgUsers.has(String(uid))) coldLeads++;
            } catch {}
          }
          if (coldLeads > 0) lines.push(`❄️ *Cold leads:* ${coldLeads} waitlist users never messaged — ideal for re-engagement`);
        } catch { /* skip */ }
        lines.push(`💎 *Premium:* ${premiumUsers}/${totalUsers} users = ${convPct}% conversion`);
        lines.push(`📊 *Funnel:* waitlist ${funnelWaitlist} → active ${funnelActive} (${w2a}%) → premium ${funnelPremium} (${a2p}%)`);
        // Sprint 1138 (wave 20): engaged cohort (users with >5 messages)
        const powerUsers = Array.from(userMsgCounts.values()).filter(n => n > 5).length;
        const powerPct = totalUsers > 0 ? Math.round((powerUsers / totalUsers) * 100) : 0;
        if (totalUsers > 0) lines.push(`🔥 *Engaged cohort:* ${powerUsers}/${totalUsers} users (${powerPct}%) sent >5 messages`);
        // Sprint 1138 (wave 22): bounce rate (users who sent exactly 1 message)
        const bounceUsers = Array.from(userMsgCounts.values()).filter(n => n === 1).length;
        const bouncePct = totalUsers > 0 ? Math.round((bounceUsers / totalUsers) * 100) : 0;
        if (totalUsers > 0) lines.push(`📤 *Bounce rate:* ${bounceUsers}/${totalUsers} users (${bouncePct}%) sent only 1 message`);
        // Sprint 1138 (wave 23): messages per active user (depth of engagement)
        if (totalUsers > 0) {
          const totalMsgCount = Array.from(userMsgCounts.values()).reduce((s, v) => s + v, 0);
          const msgsPerUser = (totalMsgCount / totalUsers).toFixed(1);
          const depthIcon = parseFloat(msgsPerUser) >= 10 ? '🔥' : parseFloat(msgsPerUser) >= 5 ? '💬' : '📊';
          lines.push(`${depthIcon} *Depth:* ${msgsPerUser} msgs/active user (${totalMsgCount} total ÷ ${totalUsers} users)`);
        }
        // Sprint 1138 (wave 25): % of users who reached message limit (monetization signal)
        try {
          const limitUsers = new Set<string>();
          for (const dayData of Object.values(counts)) {
            for (const k of Object.keys(dayData)) {
              if (k.endsWith('-limit')) limitUsers.add(k.replace('-limit', ''));
            }
          }
          const limitCount = limitUsers.size;
          if (totalUsers > 0) {
            const limitPct = Math.round((limitCount / totalUsers) * 100);
            const limitIcon = limitPct >= 30 ? '🔥' : limitPct >= 10 ? '⚠️' : '💤';
            lines.push(`${limitIcon} *Paywall pressure:* ${limitCount}/${totalUsers} users (${limitPct}%) hit message limit`);
          }
        } catch { /* skip */ }
        // Sprint 1138 (wave 24): avg time between first and second message (stickiness)
        try {
          const userPremiumPath2 = path.join(ROOT, 'workspace', 'achiri', 'memory', 'user-premium.jsonl');
          if (fs.existsSync(userPremiumPath2)) {
            const upLines2 = fs.readFileSync(userPremiumPath2, 'utf-8').split('\n').filter(l => l.trim());
            const userFirstTs = new Map<string, number>();
            const userSecondTs = new Map<string, number>();
            for (const l of upLines2) {
              try {
                const entry = JSON.parse(l);
                const uid = entry.uid ?? entry.user_id ?? entry.telegram_id;
                const ts = entry.ts ?? entry.timestamp ?? entry.created_at;
                if (!uid || !ts) continue;
                const t = new Date(ts).getTime();
                if (!userFirstTs.has(String(uid))) {
                  userFirstTs.set(String(uid), t);
                } else if (!userSecondTs.has(String(uid))) {
                  const first = userFirstTs.get(String(uid))!;
                  if (t > first) userSecondTs.set(String(uid), t);
                }
              } catch {}
            }
            if (userSecondTs.size >= 3) {
              const gaps: number[] = [];
              for (const [uid, t2] of Array.from(userSecondTs.entries())) {
                const t1 = userFirstTs.get(uid);
                if (t1) gaps.push((t2 - t1) / 3600000); // hours
              }
              const avgGapH = gaps.reduce((s, v) => s + v, 0) / gaps.length;
              const stickyIcon = avgGapH < 1 ? '🔥' : avgGapH < 6 ? '💬' : '❄️';
              const gapStr = avgGapH < 1 ? `${Math.round(avgGapH * 60)}m` : `${Math.round(avgGapH)}h`;
              lines.push(`${stickyIcon} *Stickiness:* avg ${gapStr} between 1st→2nd msg (${userSecondTs.size} users)`);
            }
          }
        } catch { /* skip */ }
        // Sprint 1143 (wave 20): peak hour of user messages
        try {
          const hourCounts: number[] = new Array(24).fill(0);
          const userPremiumPath = path.join(ROOT, 'workspace', 'achiri', 'memory', 'user-premium.jsonl');
          if (fs.existsSync(userPremiumPath)) {
            const upLines = fs.readFileSync(userPremiumPath, 'utf-8').split('\n').filter(l => l.trim());
            for (const l of upLines) {
              try {
                const entry = JSON.parse(l);
                const ts = entry.ts ?? entry.timestamp ?? entry.created_at;
                if (ts) {
                  const h = new Date(ts).getHours();
                  if (h >= 0 && h < 24) hourCounts[h]++;
                }
              } catch {}
            }
          }
          const maxHourCount = Math.max(...hourCounts);
          if (maxHourCount > 0) {
            const peakHour = hourCounts.indexOf(maxHourCount);
            const peakStr = peakHour < 12 ? `${peakHour === 0 ? 12 : peakHour}am` : peakHour === 12 ? '12pm' : `${peakHour - 12}pm`;
            lines.push(`⏰ *Peak hour:* ${peakStr} (${maxHourCount} events)`);
          }
        } catch { /* skip */ }
        lines.push('');
      }
    } catch { /* skip */ }

    // Sprint 1074: Re-engagement stats
    // Sprint 1138 (wave 17): re-engagement success rate (sent vs replied)
    const reengagePath = path.join(ROOT, 'workspace', 'achiri', 'reengage-log.jsonl');
    if (fs.existsSync(reengagePath)) {
      const reLines = fs.readFileSync(reengagePath, 'utf-8').split('\n').filter(l => l.trim());
      const today = new Date().toISOString().slice(0, 10);
      let todayCount = 0;
      let repliedCount = 0;
      const reengagedUids = new Set<string>();
      for (const l of reLines) {
        try {
          const re = JSON.parse(l);
          if (re.sentAt?.startsWith(today)) todayCount++;
          if (re.uid) reengagedUids.add(re.uid);
          if (re.replied === true) repliedCount++;
        } catch {}
      }
      const replyPct = reLines.length > 0 ? Math.round((repliedCount / reLines.length) * 100) : 0;
      const replyStr = reLines.length > 0 ? ` · *${replyPct}%* reply rate (${repliedCount}/${reLines.length})` : '';
      // Sprint 1138 (wave 18): re-engagement vs organic message breakdown
      let organicVsReStr = '';
      try {
        const countsPath2 = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
        if (fs.existsSync(countsPath2)) {
          const counts2 = JSON.parse(fs.readFileSync(countsPath2, 'utf-8')) as Record<string, Record<string, number>>;
          let allMsgs2 = 0;
          for (const dayData of Object.values(counts2)) {
            for (const [k, v] of Object.entries(dayData)) {
              if (k.startsWith('validate') || k.startsWith('e2e') || k.endsWith('-limit') || k.endsWith('-paid') || k.endsWith('-bypass')) continue;
              allMsgs2 += v as number;
            }
          }
          // Estimate re-engagement msgs = msgs from re-engaged UIDs on the day they were re-engaged
          let reengagedMsgs2 = 0;
          for (const l of reLines) {
            try {
              const re = JSON.parse(l);
              if (!re.uid || !re.sentAt) continue;
              const d = re.sentAt.slice(0, 10);
              const dayData = counts2[d];
              if (dayData) reengagedMsgs2 += dayData[re.uid] ?? 0;
            } catch {}
          }
          if (allMsgs2 > 0) {
            const orgPct = Math.round(Math.max(0, allMsgs2 - reengagedMsgs2) / allMsgs2 * 100);
            organicVsReStr = ` · organic: *${orgPct}%*`;
          }
        }
      } catch { /* skip */ }
      lines.push(`*Re-engagement:* ${todayCount} today / ${reLines.length} total${replyStr}${organicVsReStr}`);
      lines.push('');
    }

    const tgToken = process.env.ACHIRI_TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET';
    lines.push(`*Telegram Bot:* ${tgToken === 'SET' ? '✅' : '⚠️'} Token: ${tgToken}`);

    // Sprint 1138 (wave 21): whitelist vs waitlist ratio
    try {
      const whitelistPath = path.join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');
      const waitlistPath2 = path.join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
      const whitelistCount = fs.existsSync(whitelistPath)
        ? fs.readFileSync(whitelistPath, 'utf-8').split('\n').filter(l => l.trim()).length : 0;
      const waitlistTotal = fs.existsSync(waitlistPath2)
        ? fs.readFileSync(waitlistPath2, 'utf-8').split('\n').filter(l => l.trim()).length : 0;
      if (waitlistTotal > 0) {
        const approvedPct = Math.round((whitelistCount / waitlistTotal) * 100);
        const icon = approvedPct >= 80 ? '✅' : approvedPct >= 50 ? '⚠️' : '🔴';
        lines.push(`${icon} *Alpha access:* ${whitelistCount} whitelist / ${waitlistTotal} waitlist (${approvedPct}% approved)`);
      }
    } catch { /* skip */ }

    // Sprint 1142 (wave 19): last message received from any user (recency signal)
    try {
      const countsPath3 = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
      if (fs.existsSync(countsPath3)) {
        const counts3 = JSON.parse(fs.readFileSync(countsPath3, 'utf-8')) as Record<string, Record<string, number>>;
        const dates3 = Object.keys(counts3).sort().reverse();
        let lastActiveDate = '';
        for (const d of dates3) {
          const dayData = counts3[d];
          const hasMsg = Object.entries(dayData).some(([k, v]) =>
            !k.startsWith('validate') && !k.startsWith('e2e') &&
            !k.endsWith('-limit') && !k.endsWith('-paid') && !k.endsWith('-bypass') &&
            (v as number) > 0
          );
          if (hasMsg) { lastActiveDate = d; break; }
        }
        if (lastActiveDate) {
          const daysAgo = Math.round((Date.now() - new Date(lastActiveDate).getTime()) / 86_400_000);
          const recencyIcon = daysAgo === 0 ? '🟢' : daysAgo <= 1 ? '🟡' : '🔴';
          const ageStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;
          lines.push(`${recencyIcon} *Last user message:* ${ageStr}`);
        }
      }
    } catch { /* skip */ }

    // Sprint 1143 (wave 21): response latency avg from achiri-telegram-out.log
    try {
      const achiriOutLog = path.join(ROOT, 'logs', 'achiri-telegram-out.log');
      if (fs.existsSync(achiriOutLog)) {
        const logContent = fs.readFileSync(achiriOutLog, 'utf-8');
        const latencyMatches = Array.from(logContent.matchAll(/response.*?(\d+)\s*ms/gi));
        if (latencyMatches.length >= 3) {
          const recent10 = latencyMatches.slice(-10).map(m => parseInt(m[1]));
          const avgMs = Math.round(recent10.reduce((s, v) => s + v, 0) / recent10.length);
          const latIcon = avgMs < 500 ? '✅' : avgMs < 2000 ? '⚠️' : '🔴';
          lines.push(`${latIcon} *Avg response:* ${avgMs}ms (last ${recent10.length} interactions)`);
        }
      }
    } catch { /* skip */ }

    // Sprint 1144 (wave 18): server time and timezone
    const serverNow = new Date();
    const serverTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    lines.push(`🕐 *Server time:* ${serverNow.toISOString().replace('T', ' ').slice(0, 19)} UTC (${serverTZ})`);

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

    // Sprint 1138 (wave 26): show Derja profiler pass rate from latest cached run
    try {
      const derjaLatestPath = path.join(ROOT, 'reports', 'derja-profiler-latest.json');
      const derjaLatestPath2 = path.join(ROOT, 'workspace', 'achiri', 'derja-profiler-latest.json');
      const dpPath = fs.existsSync(derjaLatestPath) ? derjaLatestPath : fs.existsSync(derjaLatestPath2) ? derjaLatestPath2 : null;
      if (dpPath) {
        const dp = JSON.parse(fs.readFileSync(dpPath, 'utf-8'));
        const passed = dp.passed ?? dp.pass ?? 0;
        const total = dp.total ?? dp.total_tests ?? (passed + (dp.failed ?? 0));
        const dpTs = dp.timestamp ?? dp.generated_at ?? dp.run_at;
        const dpAgeH = dpTs ? (Date.now() - new Date(dpTs).getTime()) / 3600000 : null;
        const dpAgeStr = dpAgeH != null ? (dpAgeH < 1 ? `${Math.round(dpAgeH * 60)}m ago` : `${Math.round(dpAgeH)}h ago`) : '';
        if (total > 0) {
          const dpPct = Math.round((passed / total) * 100);
          const dpIcon = dpPct === 100 ? '✅' : dpPct >= 80 ? '⚠️' : '❌';
          lines.push(`  ${dpIcon} *Cached pass rate:* ${passed}/${total} (${dpPct}%)${dpAgeStr ? ` · ${dpAgeStr}` : ''}`);
        }
      }
    } catch { /* skip */ }

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

/**
 * Sprint 1180: /achiri-stats — DAU, retention, premium count, top users
 * Reads from reports/achiri-analytics.json and workspace/achiri/daily-counts.json
 */
export function cmdAchiriStats(): string {
  const lines: string[] = ['📊 *Achiri Stats*', ''];

  // Analytics report
  try {
    const aaPath = path.join(ROOT, 'reports', 'achiri-analytics.json');
    if (fs.existsSync(aaPath)) {
      const aa = JSON.parse(fs.readFileSync(aaPath, 'utf-8'));
      const ov = aa.overview ?? {};
      const today = aa.today ?? {};
      lines.push(`👥 *Total users:* ${ov.total_users ?? 0}`);
      lines.push(`📅 *DAU (today):* ${today.dau ?? 0} · ${today.msgs ?? 0} msgs`);
      lines.push(`🔁 *7d retention:* ${ov.retention_pct ?? 0}%`);
      lines.push(`📋 *Waitlist:* ${ov.waitlist_count ?? 0} pending · ${ov.invited_count ?? 0} invited`);
      if ((ov.errors_7d ?? 0) > 0) lines.push(`⚠️ *Errors (7d):* ${ov.errors_7d}`);
    } else {
      lines.push('⚠️ achiri-analytics.json not found — run /achiridata to generate');
    }
  } catch (e: any) {
    lines.push(`❌ Analytics read failed: ${(e.message ?? '').slice(0, 100)}`);
  }

  // 7-day DAU trend from daily-counts.json
  try {
    const dcPath = path.join(ROOT, 'workspace', 'achiri', 'daily-counts.json');
    if (fs.existsSync(dcPath)) {
      const dc: Record<string, Record<string, number>> = JSON.parse(fs.readFileSync(dcPath, 'utf-8'));
      const isTestId = (id: string) =>
        id.startsWith('validate-') || id.startsWith('smoke-') ||
        id.startsWith('e2e-') || id === 'tarek-test';
      const now = new Date();
      const trend: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
        const entries = dc[d] ?? {};
        const dau = Object.keys(entries).filter(k => !isTestId(k)).length;
        trend.push(`${d.slice(5)}: ${dau}`);
      }
      lines.push('');
      lines.push('*7d DAU trend:*');
      lines.push('`' + trend.join(' | ') + '`');
    }
  } catch { /* skip */ }

  // Premium users
  try {
    const premPath = path.join(ROOT, 'workspace', 'achiri', 'memory', 'user-premium.jsonl');
    if (fs.existsSync(premPath)) {
      const premLines = fs.readFileSync(premPath, 'utf-8').trim().split('\n').filter(Boolean);
      const premUsers = new Set<string>();
      for (const l of premLines) {
        try { const e = JSON.parse(l); if (e.user_id ?? e.userId) premUsers.add(e.user_id ?? e.userId); } catch {}
      }
      lines.push('');
      lines.push(`💎 *Premium users:* ${premUsers.size}`);
    }
  } catch { /* skip */ }

  // Top users
  try {
    const aaPath = path.join(ROOT, 'reports', 'achiri-analytics.json');
    if (fs.existsSync(aaPath)) {
      const aa = JSON.parse(fs.readFileSync(aaPath, 'utf-8'));
      const topUsers: any[] = (aa.top_users ?? []).slice(0, 5);
      if (topUsers.length > 0) {
        lines.push('');
        lines.push('*Top users:*');
        for (const u of topUsers) {
          lines.push(`  \`${u.user_id}\` — ${u.total_msgs} msgs · ${u.days_active}d active`);
        }
      }
    }
  } catch { /* skip */ }

  const genAt = (() => {
    try {
      const aaPath = path.join(ROOT, 'reports', 'achiri-analytics.json');
      if (fs.existsSync(aaPath)) {
        const gen = JSON.parse(fs.readFileSync(aaPath, 'utf-8')).generated_at;
        if (gen) return new Date(gen).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
      }
    } catch {}
    return '';
  })();
  if (genAt) { lines.push(''); lines.push(`_Report generated: ${genAt}_`); }

  return lines.join('\n');
}
