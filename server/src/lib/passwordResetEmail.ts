import { env } from "../config/env.js";

export function passwordResetEmailConfigured() {
  return Boolean(env.RESEND_API_KEY && env.PASSWORD_RESET_FROM);
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  if (!env.RESEND_API_KEY || !env.PASSWORD_RESET_FROM) {
    throw new Error("Password reset email is not configured");
  }

  const resetUrl = new URL("/", env.CLIENT_ORIGIN);
  resetUrl.searchParams.set("resetToken", resetToken);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "hospital-billing-api/0.1"
    },
    body: JSON.stringify({
      from: env.PASSWORD_RESET_FROM,
      to: [email],
      subject: "Reset your Hospital Billing password",
      text: `Reset your password within ${env.PASSWORD_RESET_TTL_MINUTES} minutes: ${resetUrl.toString()}`,
      html: `<p>Use the link below to reset your Hospital Billing password.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.</p>`
    })
  });

  if (!response.ok) {
    throw new Error(`Password reset email provider returned ${response.status}`);
  }
}
