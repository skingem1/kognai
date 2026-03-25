/**
 * onboarding-email.ts — Bloomberg CFO agent: subscriber welcome email
 * Sprint 1239 / LEMON-SCAFFOLD-02
 *
 * Called from lemon-webhook on subscription_created.
 * Sends welcome email via Resend API with Kognai branding,
 * subscription details, and Telegram bot link.
 *
 * Usage: sendOnboardingEmail({ email, plan, subscriptionId })
 */

const RESEND_API_KEY = process.env['RESEND_API_KEY'] ?? '';
const FROM_EMAIL     = process.env['FROM_EMAIL']     ?? 'welcome@kognai.ai';
const TELEGRAM_BOT   = process.env['KOGNAI_TELEGRAM_BOT_USERNAME'] ?? '@KognaiBot';

export interface OnboardingPayload {
  email:          string;
  plan:           string;
  subscriptionId: string;
}

export async function sendOnboardingEmail(payload: OnboardingPayload): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[bloomberg/onboarding] RESEND_API_KEY not set — skipping email');
    return;
  }

  const html = buildEmailHtml(payload);
  const body = JSON.stringify({
    from:    FROM_EMAIL,
    to:      [payload.email],
    subject: '🎉 Welcome to Kognai — Your AI Content Agent is Active',
    html,
  });

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text.slice(0, 200)}`);
  }

  console.log(`[bloomberg/onboarding] welcome email sent to ${payload.email}`);
}

function buildEmailHtml(payload: OnboardingPayload): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
  <h1 style="color: #1a1a2e;">Welcome to Kognai 🚀</h1>
  <p>Your <strong>${payload.plan}</strong> subscription is now active.</p>
  <hr/>
  <h2>Get Started</h2>
  <ol>
    <li>Open Telegram and search for <strong>${TELEGRAM_BOT}</strong></li>
    <li>Send <code>/start</code> to activate your agent</li>
    <li>Use <code>/quickstart</code> to see your first content options</li>
  </ol>
  <hr/>
  <p style="font-size: 12px; color: #888;">
    Subscription ID: ${payload.subscriptionId}<br/>
    Questions? Reply to this email.
  </p>
</body>
</html>`.trim();
}
