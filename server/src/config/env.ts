import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/hospital_billing"),
  DNS_SERVERS: z.string().optional(),
  JWT_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173")
});

export const env = schema.parse(process.env);
