import { createHash } from "node:crypto";
import { env } from "../config/env.js";

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

export function invoiceEmailConfigured() {
  return Boolean(env.RESEND_API_KEY && (env.INVOICE_FROM || env.PASSWORD_RESET_FROM));
}

export async function sendInvoiceEmail(input: InvoiceEmailInput) {
  const from = env.INVOICE_FROM || env.PASSWORD_RESET_FROM;
  if (!env.RESEND_API_KEY || !from) throw new Error("Invoice email is not configured");

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
      from,
      to: [input.patientEmail],
      subject: `Invoice ${input.invoiceNo} from ${input.hospitalName}`,
      text: `Hello ${input.patientName},\n\nYour invoice ${input.invoiceNo} for BDT ${input.dueAmount} is due on ${input.dueAt.toLocaleDateString("en-GB")}. The PDF invoice is attached.`,
      html: `<p>Hello ${escapeHtml(input.patientName)},</p><p>Your invoice <strong>${escapeHtml(input.invoiceNo)}</strong> for <strong>BDT ${escapeHtml(input.dueAmount)}</strong> is due on ${escapeHtml(input.dueAt.toLocaleDateString("en-GB"))}.</p><p>The PDF invoice is attached.</p>`,
      attachments: [{ filename: `${input.invoiceNo}.pdf`, content: input.pdf.toString("base64") }]
    })
  });

  if (!response.ok) throw new Error(`Invoice email provider returned ${response.status}`);
  const result = await response.json() as { id?: string };
  return result.id ?? "";
}
