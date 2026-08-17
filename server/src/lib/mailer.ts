import { env } from "../config/env.js";

/**
 * Returns true when Brevo HTTP API credentials are present.
 * Brevo uses HTTPS (port 443) — works on Render free tier.
 * Gmail SMTP (port 587) is blocked by Render's network.
 */
export function brevoConfigured() {
  return Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

interface BrevoEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ name: string; content: string; contentType: string }>;
}

/**
 * Sends an email via Brevo's HTTPS API.
 * Works on any cloud host (Render, Railway, Fly, etc.) because it uses port 443.
 */
export async function sendBrevoEmail(options: BrevoEmailOptions): Promise<string> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    throw new Error("Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL missing)");
  }

  const body: Record<string, unknown> = {
    sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
    to: [{ email: options.to, name: options.toName ?? options.to }],
    subject: options.subject,
    textContent: options.text,
    htmlContent: options.html
  };

  if (options.attachments?.length) {
    body.attachment = options.attachments;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.status.toString());
    throw new Error(`Brevo API returned ${response.status}: ${err}`);
  }

  const result = await response.json() as { messageId?: string };
  return result.messageId ?? "";
}
