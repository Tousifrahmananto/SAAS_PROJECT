import { Schema, model } from "mongoose";

const auditLogSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", default: null },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  ipAddress: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  correlationId: { type: String, required: true, index: true }
}, { timestamps: { createdAt: "occurredAt", updatedAt: false } });

auditLogSchema.index({ hospital: 1, occurredAt: -1 });
export const AuditLog = model("AuditLog", auditLogSchema);
