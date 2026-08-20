import "dotenv/config";
import { z } from "zod";

const blankToUndefined = (value: unknown) => typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = (minimum = 1) => z.preprocess(blankToUndefined, z.string().min(minimum).optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: optionalString(),
  DNS_SERVERS: optionalString(),
  JWT_SECRET: optionalString(32),
  CLIENT_ORIGIN: z.string().url().transform((value) => value.replace(/\/$/, "")).default("http://localhost:5173"),
  SERVER_URL: z.string().url().transform((value) => value.replace(/\/$/, "")).default("http://localhost:4000"),
  RESEND_API_KEY: optionalString(),
  PASSWORD_RESET_FROM: optionalString(3),
  INVOICE_FROM: optionalString(3),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(20),
  SSLCOMMERZ_STORE_ID: optionalString(),
  SSLCOMMERZ_STORE_PASSWORD: optionalString(),
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
