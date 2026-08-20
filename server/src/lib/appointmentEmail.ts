import { env } from "../config/env.js";

interface AppointmentEmailInput {
  email: string;
  name: string;
  subject: string;
  startsAt: Date;
  durationMinutes: number;
  kind: "confirmation" | "reminder";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]!);
}

export function appointmentEmailConfigured() {
  return Boolean(env.RESEND_API_KEY && (env.INVOICE_FROM || env.PASSWORD_RESET_FROM));
}

export async function sendAppointmentEmail(input: AppointmentEmailInput) {
  const from = env.INVOICE_FROM || env.PASSWORD_RESET_FROM;
  if (!env.RESEND_API_KEY || !from) throw new Error("Appointment email is not configured");
  const action = input.kind === "reminder" ? "Reminder" : "Appointment request received";
  const when = input.startsAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "hospital-billing-api/0.1"
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `${action}: ${input.subject}`,
      text: `Hello ${input.name},\n\n${action} for ${input.subject} on ${when} (${input.durationMinutes} minutes).`,
      html: `<p>Hello ${escapeHtml(input.name)},</p><p><strong>${escapeHtml(action)}</strong> for ${escapeHtml(input.subject)}.</p><p>${escapeHtml(when)} (${input.durationMinutes} minutes).</p>`
    })
  });
  if (!response.ok) throw new Error(`Appointment email provider returned ${response.status}`);
}
