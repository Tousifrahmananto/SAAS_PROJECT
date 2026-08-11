import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).optional(),
  DNS_SERVERS: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  RESEND_API_KEY: z.string().min(1).optional(),
  PASSWORD_RESET_FROM: z.string().min(3).optional(),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(20)
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
