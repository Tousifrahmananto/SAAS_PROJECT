import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).optional(),
  DNS_SERVERS: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  CLIENT_ORIGIN: z.string().url().transform((value) => value.replace(/\/$/, "")).default("http://localhost:5173"),
  SERVER_URL: z.string().url().transform((value) => value.replace(/\/$/, "")).default("http://localhost:4000"),
  RESEND_API_KEY: z.string().min(1).optional(),
  PASSWORD_RESET_FROM: z.string().min(3).optional(),
  INVOICE_FROM: z.string().min(3).optional(),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(20),
  // Gmail SMTP (nodemailer) — sends to any email address, no domain required
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(8).optional(),
  GMAIL_FROM: z.string().min(3).optional(),
  SSLCOMMERZ_STORE_ID: z.string().min(1).optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().min(1).optional(),
  SSLCOMMERZ_SANDBOX: z.enum(["true", "false"]).default("true").transform((value) => value === "true")
});

const parsed = schema.parse(process.env);

if (parsed.NODE_ENV === "production" && (!parsed.MONGODB_URI || !parsed.JWT_SECRET)) {
  throw new Error("MONGODB_URI and JWT_SECRET are required in production");
}

export const env = {
  ...parsed,
  MONGODB_URI: parsed.MONGODB_URI ?? "mongodb://127.0.0.1:27017/hospital_billing",
  JWT_SECRET: parsed.JWT_SECRET ?? "development-only-secret-change-me-now"
};
