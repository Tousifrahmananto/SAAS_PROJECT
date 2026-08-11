import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AuditLog } from "../models/AuditLog.js";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"));

auditRouter.get("/", async (req, res, next) => {
  try {
    const query = z.object({
      action: z.string().trim().max(80).default(""),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      format: z.enum(["json", "csv"]).default("json")
    }).parse(req.query);
    const filter: Record<string, unknown> = { hospital: req.auth!.hospitalId };
    if (query.action) filter.action = query.action;
    if (query.from || query.to) filter.occurredAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {})
    };
    const logs = await AuditLog.find(filter)
      .populate("actor", "fullName email")
      .sort({ occurredAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean();
    if (query.format === "csv") {
      const rows = ["occurredAt,action,entityType,entityId,actor,correlationId", ...logs.map((log) => [
        log.occurredAt,
        log.action,
        log.entityType,
        log.entityId,
        typeof log.actor === "object" && log.actor && "email" in log.actor ? log.actor.email : "",
        log.correlationId
      ].map(csvCell).join(","))];
      res.type("text/csv").attachment("audit-logs.csv").send(rows.join("\n"));
      return;
    }
    const total = await AuditLog.countDocuments(filter);
    res.json({ data: logs, meta: { page: query.page, limit: query.limit, total } });
  } catch (error) { next(error); }
});
