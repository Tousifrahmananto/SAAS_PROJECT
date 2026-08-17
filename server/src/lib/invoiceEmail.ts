import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { createGmailTransport, gmailConfigured, resolvedFrom } from "./mailer.js";

interface InvoiceEmailInput {
  invoiceId: string;
  invoiceNo: string;
  hospitalName: string;
  patientName: string;
  patientEmail: string;
  dueAmount: string;
  dueAt: Date;
  pdf: Buffer;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]!);
}

/**
 * Returns true when at least one email transport is configured.
 */
export function invoiceEmailConfigured() {
  return gmailConfigured() || Boolean(env.RESEND_API_KEY && (env.INVOICE_FROM || env.PASSWORD_RESET_FROM));
}

export async function sendInvoiceEmail(input: InvoiceEmailInput) {
  const from = resolvedFrom() || env.INVOICE_FROM || env.PASSWORD_RESET_FROM;
  if (!from) throw new Error("Invoice email is not configured");

  const subject = `Invoice ${input.invoiceNo} from ${input.hospitalName}`;
  const text = `Hello ${input.patientName},\n\nYour invoice ${input.invoiceNo} for BDT ${input.dueAmount} is due on ${input.dueAt.toLocaleDateString("en-GB")}.\n\nThe PDF invoice is attached to this email.`;
  const html = `<p>Hello <strong>${escapeHtml(input.patientName)}</strong>,</p>
<p>Your invoice <strong>${escapeHtml(input.invoiceNo)}</strong> for <strong>BDT ${escapeHtml(input.dueAmount)}</strong> is due on ${escapeHtml(input.dueAt.toLocaleDateString("en-GB"))}.</p>
<p>The PDF invoice is attached to this email.</p>`;

  // ── Gmail SMTP (works for any recipient, no domain needed) ─────────────────
  if (gmailConfigured()) {
    const transporter = createGmailTransport();
    await transporter.sendMail({
      from,
      to: input.patientEmail,
      subject,
      text,
      html,
      attachments: [{ filename: `${input.invoiceNo}.pdf`, content: input.pdf, contentType: "application/pdf" }]
    });
    return `gmail-${input.invoiceId}`;
  }

  // ── Resend fallback ────────────────────────────────────────────────────────
  if (env.RESEND_API_KEY && (env.INVOICE_FROM || env.PASSWORD_RESET_FROM)) {
    const recipientKey = createHash("sha256").update(input.patientEmail).digest("hex").slice(0, 16);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `invoice-${input.invoiceId}-${recipientKey}-issued`,
        "user-agent": "hospital-billing-api/0.1"
      },
      body: JSON.stringify({
        from: env.INVOICE_FROM || env.PASSWORD_RESET_FROM,
        to: [input.patientEmail],
        subject,
        text,
        html,
        attachments: [{ filename: `${input.invoiceNo}.pdf`, content: input.pdf.toString("base64") }]
      })
    });
    if (!response.ok) throw new Error(`Invoice email provider returned ${response.status}`);
    const result = await response.json() as { id?: string };
    return result.id ?? "";
  }

  throw new Error("No email transport is configured. Set GMAIL_USER + GMAIL_APP_PASSWORD in server/.env");
}

