import * as nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SUPPORT_EMAIL_SMTP_HOST || 'smtp.ionos.fr',
  port: parseInt(process.env.SUPPORT_EMAIL_SMTP_PORT || '465', 10),
  secure: true, // port 465 = SSL
  auth: {
    user: process.env.SUPPORT_EMAIL || 'support@invoica.ai',
    pass: process.env.SUPPORT_EMAIL_PASSWORD,
  },
});

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `"Invoica" <${process.env.SUPPORT_EMAIL || 'support@invoica.ai'}>`,
    to,
    subject: 'Invoica Ledger Access Verification',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <img src="https://invoica.ai/logo.png" alt="Invoica" style="height: 48px; margin-bottom: 32px;" />
        <h2 style="font-size: 20px; font-weight: 600; color: #111; margin: 0 0 8px;">Ledger Access Verification</h2>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Someone requested access to your company ledger on Invoica. Use the code below to confirm access. This code expires in <strong>10 minutes</strong>.
        </p>
        <div style="background: #f4f3ff; border: 1px solid #635BFF30; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #635BFF; margin: 0; font-variant-numeric: tabular-nums;">${code}</p>
        </div>
        <p style="color: #888; font-size: 12px; line-height: 1.5; margin: 0;">
          If you did not request this, you can safely ignore this email. Your ledger data is secure.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} Invoica · <a href="https://invoica.ai" style="color: #aaa;">invoica.ai</a></p>
      </div>
    `,
    text: `Your Invoica ledger access code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
  });
}
