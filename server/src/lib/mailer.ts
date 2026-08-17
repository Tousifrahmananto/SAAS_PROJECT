import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * Returns true when Gmail SMTP credentials are present.
 */
export function gmailConfigured() {
  return Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
}

/**
 * Creates a Nodemailer transporter using Gmail SMTP.
 * Gmail App Passwords let you send to ANY email address worldwide for free.
 */
export function createGmailTransport() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("Gmail SMTP is not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD  // 16-character App Password, NOT your Gmail login password
    }
  });
}

/**
 * Resolved "from" address for outgoing mail.
 * Uses Gmail sender if configured, otherwise falls back to Resend FROM header.
 */
export function resolvedFrom() {
  if (env.GMAIL_USER) return env.GMAIL_FROM || `Hospital Billing <${env.GMAIL_USER}>`;
  return env.INVOICE_FROM || env.PASSWORD_RESET_FROM || "";
}
