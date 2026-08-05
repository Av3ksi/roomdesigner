import { Resend } from "resend";

/**
 * Transactional email — login links and order confirmations. Degrades like
 * every other integration in this app: no RESEND_API_KEY means email sends
 * are skipped (logged instead), not a crash. Login links and order
 * confirmations still work functionally without email configured — the
 * login link just has nowhere to be delivered, which callers should surface
 * honestly rather than pretend succeeded.
 */

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

let cached: Resend | null = null;
function client(): Resend {
  if (!cached) cached = new Resend(process.env.RESEND_API_KEY);
  return cached;
}

// Resend requires a verified sending domain — until one is configured,
// their own onboarding@resend.dev address works for testing (delivers only
// to the account owner's own verified email, per Resend's sandbox rules).
const FROM = process.env.EMAIL_FROM || "Vistroom <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Returns true if the email was actually sent (or would have been, in demo mode logging). */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!emailEnabled()) {
    console.log(`[vistroom] email disabled (no RESEND_API_KEY) — would have sent to ${input.to}: "${input.subject}"`);
    return false;
  }
  try {
    const result = await client().emails.send({ from: FROM, to: input.to, subject: input.subject, html: input.html });
    if (result.error) {
      console.error("[vistroom] Resend send failed:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[vistroom] Resend send threw:", err);
    return false;
  }
}

const EMAIL_WRAPPER = (bodyHtml: string) => `
<div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #22211F;">
  <div style="font-size: 22px; font-weight: 600; letter-spacing: 0.02em; margin-bottom: 24px;">Vistroom</div>
  ${bodyHtml}
  <p style="margin-top: 32px; font-size: 12px; color: #8A8378;">Vistroom — AI interior design.</p>
</div>
`;

export function loginEmailHtml(loginUrl: string): string {
  return EMAIL_WRAPPER(`
    <p style="font-size: 15px; line-height: 1.6;">Click below to sign in. This link works once and expires in 15 minutes.</p>
    <p style="margin: 24px 0;">
      <a href="${loginUrl}" style="display: inline-block; background: #C8A96E; color: #22211F; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">Sign in to Vistroom</a>
    </p>
    <p style="font-size: 13px; color: #8A8378;">If you didn't request this, you can safely ignore this email.</p>
  `);
}

export function orderConfirmationEmailHtml(opts: { orderId: string; totalLabel: string; itemNames: string[] }): string {
  return EMAIL_WRAPPER(`
    <p style="font-size: 15px; line-height: 1.6;">Thank you for your order — here's your confirmation.</p>
    <p style="font-size: 13px; color: #8A8378;">Order ${opts.orderId}</p>
    <ul style="font-size: 14px; line-height: 1.8; padding-left: 18px;">
      ${opts.itemNames.map((n) => `<li>${n}</li>`).join("")}
    </ul>
    <p style="font-size: 15px; font-weight: 600; margin-top: 16px;">Total: ${opts.totalLabel}</p>
    <p style="font-size: 13px; color: #8A8378; margin-top: 16px;">We'll email you again once your order ships.</p>
  `);
}
