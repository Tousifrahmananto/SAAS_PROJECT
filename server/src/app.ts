import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { requestContext } from "./middleware/requestContext.js";
import { authRouter } from "./routes/auth.js";
import { chargeRouter } from "./routes/charges.js";
import { encounterRouter } from "./routes/encounters.js";
import { organizationRouter } from "./routes/organizations.js";
import { patientRouter } from "./routes/patients.js";

export const app = express();
app.disable("x-powered-by");
if (env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"]
}));
app.use(express.json({ limit: "1mb" }));
app.use(requestContext);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/patients", patientRouter);
app.use("/api/encounters", encounterRouter);
app.use("/api/charges", chargeRouter);
app.use("/api/organizations", organizationRouter);
app.use(notFound);
app.use(errorHandler);
