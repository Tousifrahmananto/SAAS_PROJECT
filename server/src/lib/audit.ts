import type { Request } from "express";
import type { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.js";

export async function writeAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: Types.ObjectId,
  after: unknown
) {
  if (!req.auth) return;
  await AuditLog.create({
    hospital: req.auth.hospitalId,
    actor: req.auth.userId,
    department: req.auth.departmentId,
    action,
    entityType,
    entityId,
    after,
    ipAddress: req.ip,
    userAgent: req.header("user-agent") ?? "",
    correlationId: req.correlationId
  });
}
