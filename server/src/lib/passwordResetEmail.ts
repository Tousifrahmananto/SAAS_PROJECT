import { env } from "../config/env.js";
import { createGmailTransport, gmailConfigured, resolvedFrom } from "./mailer.js";

/**
 * Returns true when at least one email transport is ready.
 * Gmail SMTP (any recipient) takes priority over Resend (requires verified domain).
 */
export function passwordResetEmailConfigured() {
  return gmailConfigured() || Boolean(env.RESEND_API_KEY && env.PASSWORD_RESET_FROM);
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const resetUrl = new URL("/", env.CLIENT_ORIGIN);
  resetUrl.searchParams.set("resetToken", resetToken);

  const subject = "Reset your Hospital Billing password";
  const text = `Reset your password within ${env.PASSWORD_RESET_TTL_MINUTES} minutes:\n\n${resetUrl.toString()}\n\nIf you did not request this, ignore this email.`;
  const html = `<p>Use the link below to reset your Hospital Billing password.</p>
<p><a href="${resetUrl.toString()}">Reset password</a></p>
<p>This link expires in <strong>${env.PASSWORD_RESET_TTL_MINUTES} minutes</strong>.</p>
<p style="color:#6b7280;font-size:12px">If you did not request a password reset, you can safely ignore this email.</p>`;

  // ── Gmail SMTP (works for any recipient, no domain needed) ─────────────────
  if (gmailConfigured()) {
    const transporter = createGmailTransport();
    await transporter.sendMail({ from: resolvedFrom(), to: email, subject, text, html });
    return;
  }

  // ── Resend fallback (requires verified sender domain for non-account emails) ─
  if (env.RESEND_API_KEY && env.PASSWORD_RESET_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "user-agent": "hospital-billing-api/0.1"
      },
      body: JSON.stringify({ from: env.PASSWORD_RESET_FROM, to: [email], subject, text, html })
    });
    if (!response.ok) throw new Error(`Password reset email provider returned ${response.status}`);
    return;
  }

  throw new Error("No email transport is configured. Set GMAIL_USER + GMAIL_APP_PASSWORD in server/.env");
}
