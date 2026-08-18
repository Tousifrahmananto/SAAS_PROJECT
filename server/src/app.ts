import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { requestContext } from "./middleware/requestContext.js";
import { authRouter } from "./routes/auth.js";
import { auditRouter } from "./routes/audit.js";
import { invoiceRouter, paymentRouter, reconciliationRouter, refundRouter } from "./routes/billing.js";
import { chargeRouter } from "./routes/charges.js";
import { catalogRouter } from "./routes/catalog.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { encounterRouter } from "./routes/encounters.js";
import { organizationRouter } from "./routes/organizations.js";
import { patientRouter } from "./routes/patients.js";
import {
  appointmentRouter,
  claimRouter,
  contractRouter,
  documentRouter,
  messageRouter,
  notificationRouter,
  reportRouter
} from "./routes/portal.js";
import { staffRouter } from "./routes/staff.js";

export const app = express();
app.disable("x-powered-by");
if (env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id", "Cache-Control"]
}));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(requestContext);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/staff", staffRouter);
app.use("/api/audit", auditRouter);
app.use("/api/documents", documentRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/messages", messageRouter);
app.use("/api/contracts", contractRouter);
app.use("/api/reports", reportRouter);
app.use("/api/claims", claimRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/refunds", refundRouter);
app.use("/api/reconciliation", reconciliationRouter);
app.use("/api/patients", patientRouter);
app.use("/api/encounters", encounterRouter);
app.use("/api/charges", chargeRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/organizations", organizationRouter);
app.use(notFound);
app.use(errorHandler);
