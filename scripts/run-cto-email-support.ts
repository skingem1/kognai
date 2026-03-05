import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import https from 'https';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@invoica.ai';
const EMAIL_PASSWORD = process.env.SUPPORT_EMAIL_PASSWORD || '';
const IMAP_HOST = process.env.SUPPORT_EMAIL_IMAP_HOST || 'imap.ionos.fr';
const IMAP_PORT = parseInt(process.env.SUPPORT_EMAIL_IMAP_PORT || '993');
const SMTP_HOST = process.env.SUPPORT_EMAIL_SMTP_HOST || 'smtp.ionos.fr';
const SMTP_PORT = parseInt(process.env.SUPPORT_EMAIL_SMTP_PORT || '587');
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';

const LOG_DIR = path.join(__dirname, '../logs/email-support');
const ESCALATION_DIR = path.join(__dirname, '../reports/cto/email-escalations');
const PROCESSED_FILE = path.join(LOG_DIR, 'processed-ids.json');

[LOG_DIR, ESCALATION_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const today = new Date().toISOString().split('T')[0];
const logFile = path.join(LOG_DIR, `${today}.log`);

function log(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function loadProcessedIds(): Set<string> {
  if (!fs.existsSync(PROCESSED_FILE)) return new Set();
  try { return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'))); }
  catch { return new Set(); }
}

function saveProcessedIds(ids: Set<string>) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...ids].slice(-500), null, 2));
}

async function draftReply(from: string, subject: string, body: string): Promise<{reply: string; shouldEscalate: boolean; category: string}> {
  return new Promise((resolve, reject) => {
    const systemPrompt = `You are the CTO of Invoica, the world's first Financial OS for AI Agents. You manage the support@invoica.ai inbox.
Invoica is in BETA - free for all users. Dashboard: https://app.invoica.ai Docs: https://docs.invoica.ai Telegram: https://t.me/invoicaBot
Guidelines: Be concise and professional. Sign off as "The Invoica Team". For billing say it is free in beta. For bugs ask for repro steps and promise 24hr fix. For features thank them warmly. ESCALATE (shouldEscalate:true) for: legal threats, security issues, abuse. NEVER reveal API keys, server details, or agent names.
Respond ONLY with JSON: {"reply":"email body text","shouldEscalate":false,"category":"general_inquiry|technical_support|billing|bug_report|feature_request|escalation"}`;

    const payload = JSON.stringify({
      model: 'MiniMax-M2.5',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `From: ${from}\nSubject: ${subject}\n\nBody:\n${body.substring(0, 3000)}` }
      ]
    });

    const req = https.request({
      hostname: 'api.minimax.io',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MINIMAX_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const text = JSON.parse(data).choices?.[0]?.message?.content || '{}';
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) throw new Error('No JSON in response');
          resolve(JSON.parse(match[0]));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function saveEscalation(from: string, subject: string, body: string, category: string) {
  const file = path.join(ESCALATION_DIR, `${today}.md`);
  fs.appendFileSync(file, `\n## ${new Date().toISOString()} — ${category}\n**From:** ${from}\n**Subject:** ${subject}\n\`\`\`\n${body.substring(0, 2000)}\n\`\`\`\n---\n`);
  log(`ESCALATION: ${from} — ${subject}`);
}

async function main() {
  if (!EMAIL_PASSWORD || EMAIL_PASSWORD === 'REPLACE_WITH_IONOS_MAILBOX_PASSWORD') {
    log('ERROR: SUPPORT_EMAIL_PASSWORD not set'); process.exit(1);
  }
  if (!MINIMAX_API_KEY) {
    log('ERROR: MINIMAX_API_KEY not set'); process.exit(1);
  }

  log('Starting email check...');
  const processedIds = loadProcessedIds();

  const client = new ImapFlow({
    host: IMAP_HOST, port: IMAP_PORT, secure: true,
    auth: { user: SUPPORT_EMAIL, pass: EMAIL_PASSWORD },
    logger: false
  });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: false,
    auth: { user: SUPPORT_EMAIL, pass: EMAIL_PASSWORD },
    tls: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    log('IMAP connected');

    // Step 1: Collect emails — do NOT flag/send during active fetch stream
    interface Email { uid: number; uidStr: string; from: string; subject: string; body: string; msgId?: string; }
    const toProcess: Email[] = [];

    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true, bodyParts: ['TEXT'] })) {
        const uidStr = String(msg.uid);
        if (processedIds.has(uidStr)) continue;
        const from = msg.envelope?.from?.[0]?.address || 'unknown';
        if (from.includes('invoica.ai')) { processedIds.add(uidStr); continue; }
        // Spam domain blocklist — skip without calling AI to avoid timeout loops
        const SPAM_DOMAINS = ['out.ndlz.net', 'ndlz.net', 'mailchimp-outreach', 'gdprconfirm.com'];
        const fromDomain = from.split('@')[1] || '';
        if (SPAM_DOMAINS.some(d => fromDomain.endsWith(d))) {
          log(`  Spam blocked: ${from} — marking as seen`);
          processedIds.add(uidStr);
          continue;
        }
        const subject = msg.envelope?.subject || '(no subject)';
        const body = msg.bodyParts?.get('TEXT')?.toString() || '';
        toProcess.push({ uid: msg.uid, uidStr, from, subject, body, msgId: msg.envelope?.messageId });
      }
    } finally {
      lock.release();
    }

    if (toProcess.length === 0) {
      log('No new emails');
      saveProcessedIds(processedIds);
      await client.logout();
      return;
    }

    // Step 2: Reply + flag (safe — outside fetch stream)
    let processed = 0;
    for (const email of toProcess) {
      log(`Processing [${email.uidStr}] from ${email.from} — "${email.subject}"`);
      try {
        const { reply, shouldEscalate, category } = await draftReply(email.from, email.subject, email.body);
        log(`  category=${category} escalate=${shouldEscalate}`);
        if (shouldEscalate) saveEscalation(email.from, email.subject, email.body, category);

        await transporter.sendMail({
          from: `"Invoica Support" <${SUPPORT_EMAIL}>`,
          to: email.from, replyTo: SUPPORT_EMAIL,
          subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
          text: reply,
          ...(email.msgId ? { inReplyTo: email.msgId, references: email.msgId } : {})
        });
        log(`  Reply sent to ${email.from}`);

        // Mark as read — safe here since fetch stream is closed
        try { await client.messageFlagsAdd(email.uid, ['\\Seen'], { uid: true }); } catch {}

        processedIds.add(email.uidStr);
        saveProcessedIds(processedIds);
        processed++;
      } catch(err) {
        log(`  Error: ${err}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    await client.logout();
    log(`Done. ${processed} email(s) processed`);

  } catch(err) {
    log(`Fatal: ${err}`);
    try { await client.logout(); } catch {}
    process.exit(1);
  }
}

main().catch(err => { log(`Unhandled: ${err}`); process.exit(1); });
