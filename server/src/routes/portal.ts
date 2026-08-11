import { Router } from "express";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import {
  Appointment,
  Claim,
  Contract,
  Conversation,
  DocumentAsset,
  Notification,
  Report
} from "../models/Portal.js";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const money = z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => new Decimal(value).greaterThan(0), "Amount must be positive");
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function decodedFile(contentBase64: string, mimeType: string) {
  if (!allowedMimeTypes.has(mimeType)) throw new AppError(400, "Unsupported file type", "UNSUPPORTED_FILE_TYPE");
  const normalized = contentBase64.includes(",") ? contentBase64.slice(contentBase64.indexOf(",") + 1) : contentBase64;
  if (!/^[a-z0-9+/=\r\n]+$/i.test(normalized)) throw new AppError(400, "Invalid file content", "INVALID_FILE");
  const data = Buffer.from(normalized, "base64");
  if (!data.length || data.length > 5_000_000) throw new AppError(400, "Files must be between 1 byte and 5 MB", "FILE_SIZE_INVALID");
  return data;
}

export const documentRouter = Router();
documentRouter.use(requireAuth);
documentRouter.get("/", requirePermission("documents:read"), async (req, res, next) => {
  try {
    const documents = await DocumentAsset.find({ hospital: req.auth!.hospitalId })
      .populate("owner", "fullName email")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: documents });
  } catch (error) { next(error); }
});
documentRouter.post("/", requirePermission("documents:create"), async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1).max(180),
      category: z.enum(["CONTRACT", "INVOICE", "REPORT", "IDENTIFICATION", "OTHER"]),
      mimeType: z.string().max(120),
      contentBase64: z.string().min(4).max(7_000_000)
    }).strict().parse(req.body);
    const data = decodedFile(input.contentBase64, input.mimeType);
    const document = await DocumentAsset.create({
      hospital: req.auth!.hospitalId,
      owner: req.auth!.userId,
      name: input.name,
      category: input.category,
      mimeType: input.mimeType,
      size: data.length,
      data
    });
    await writeAudit(req, "DOCUMENT_UPLOADED", "DocumentAsset", document._id, { ...document.toObject(), data: undefined });
    res.status(201).json({ data: document });
  } catch (error) { next(error); }
});
documentRouter.get("/:documentId/download", requirePermission("documents:read"), async (req, res, next) => {
  try {
    const params = z.object({ documentId: objectId }).parse(req.params);
    const document = await DocumentAsset.findOne({ _id: params.documentId, hospital: req.auth!.hospitalId }).select("+data");
    if (!document) throw new AppError(404, "Document not found", "DOCUMENT_NOT_FOUND");
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`);
    res.send(document.data);
  } catch (error) { next(error); }
});
documentRouter.patch("/:documentId", requirePermission("documents:update"), async (req, res, next) => {
  try {
    const params = z.object({ documentId: objectId }).parse(req.params);
    const input = z.object({
      name: z.string().trim().min(1).max(180).optional(),
      category: z.enum(["CONTRACT", "INVOICE", "REPORT", "IDENTIFICATION", "OTHER"]).optional()
    }).strict().parse(req.body);
    const before = await DocumentAsset.findOne({ _id: params.documentId, hospital: req.auth!.hospitalId }).lean();
    if (!before) throw new AppError(404, "Document not found", "DOCUMENT_NOT_FOUND");
    const document = await DocumentAsset.findByIdAndUpdate(params.documentId, { $set: input }, { new: true, runValidators: true });
    await writeAudit(req, "DOCUMENT_UPDATED", "DocumentAsset", document!._id, document!.toObject(), before);
    res.json({ data: document });
  } catch (error) { next(error); }
});
documentRouter.delete("/:documentId", requirePermission("documents:delete"), async (req, res, next) => {
  try {
    const params = z.object({ documentId: objectId }).parse(req.params);
    const document = await DocumentAsset.findOneAndDelete({ _id: params.documentId, hospital: req.auth!.hospitalId });
    if (!document) throw new AppError(404, "Document not found", "DOCUMENT_NOT_FOUND");
    await writeAudit(req, "DOCUMENT_DELETED", "DocumentAsset", document._id, null, { ...document.toObject(), data: undefined });
    res.status(204).send();
  } catch (error) { next(error); }
});

export const appointmentRouter = Router();
appointmentRouter.use(requireAuth);
appointmentRouter.get("/", requirePermission("appointments:read"), async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ hospital: req.auth!.hospitalId })
      .populate("requestedBy assignedTo", "fullName email")
      .sort({ startsAt: 1 })
      .lean();
    res.json({ data: appointments });
  } catch (error) { next(error); }
});
appointmentRouter.post("/", requirePermission("appointments:create"), async (req, res, next) => {
  try {
    const input = z.object({
      subject: z.string().trim().min(2).max(160),
      description: z.string().trim().max(1200).default(""),
      startsAt: z.coerce.date(),
      durationMinutes: z.coerce.number().int().min(15).max(480).default(30)
    }).strict().parse(req.body);
    if (input.startsAt.getTime() < Date.now()) throw new AppError(400, "Appointment must be in the future", "INVALID_APPOINTMENT_TIME");
    const appointment = await Appointment.create({ ...input, hospital: req.auth!.hospitalId, requestedBy: req.auth!.userId });
    await Notification.create({ hospital: req.auth!.hospitalId, type: "APPOINTMENT", title: "New appointment request", message: input.subject, link: "appointments" });
    await writeAudit(req, "APPOINTMENT_REQUESTED", "Appointment", appointment._id, appointment.toObject());
    res.status(201).json({ data: appointment });
  } catch (error) { next(error); }
});
appointmentRouter.patch("/:appointmentId", requirePermission("appointments:update"), async (req, res, next) => {
  try {
    const params = z.object({ appointmentId: objectId }).parse(req.params);
    const input = z.object({
      startsAt: z.coerce.date().optional(),
      durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
      status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"]).optional(),
      decisionNote: z.string().trim().max(500).optional()
    }).strict().parse(req.body);
    const before = await Appointment.findOne({ _id: params.appointmentId, hospital: req.auth!.hospitalId }).lean();
    if (!before) throw new AppError(404, "Appointment not found", "APPOINTMENT_NOT_FOUND");
    const privilegedStatus = input.status && ["APPROVED", "REJECTED", "COMPLETED"].includes(input.status);
    if (privilegedStatus && !req.auth!.roles.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role))) {
      throw new AppError(403, "Administrator approval is required", "FORBIDDEN");
    }
    const appointment = await Appointment.findByIdAndUpdate(params.appointmentId, { $set: input }, { new: true, runValidators: true });
    await writeAudit(req, "APPOINTMENT_UPDATED", "Appointment", appointment!._id, appointment!.toObject(), before);
    res.json({ data: appointment });
  } catch (error) { next(error); }
});

export const messageRouter = Router();
messageRouter.use(requireAuth);
messageRouter.get("/", requirePermission("messages:read"), async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ hospital: req.auth!.hospitalId })
      .populate("openedBy messages.sender", "fullName email roles")
      .sort({ lastMessageAt: -1 })
      .lean();
    res.json({ data: conversations });
  } catch (error) { next(error); }
});
messageRouter.post("/", requirePermission("messages:create"), async (req, res, next) => {
  try {
    const input = z.object({ subject: z.string().trim().min(2).max(160), body: z.string().trim().min(1).max(4000) }).strict().parse(req.body);
    const conversation = await Conversation.create({
      hospital: req.auth!.hospitalId,
      subject: input.subject,
      openedBy: req.auth!.userId,
      messages: [{ sender: req.auth!.userId, body: input.body }]
    });
    await Notification.create({ hospital: req.auth!.hospitalId, type: "MESSAGE", title: "New support conversation", message: input.subject, link: "messages" });
    await writeAudit(req, "CONVERSATION_OPENED", "Conversation", conversation._id, conversation.toObject());
    res.status(201).json({ data: conversation });
  } catch (error) { next(error); }
});
messageRouter.post("/:conversationId/replies", requirePermission("messages:create"), async (req, res, next) => {
  try {
    const params = z.object({ conversationId: objectId }).parse(req.params);
    const input = z.object({ body: z.string().trim().min(1).max(4000) }).strict().parse(req.body);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: params.conversationId, hospital: req.auth!.hospitalId, status: "OPEN" },
      { $push: { messages: { sender: req.auth!.userId, body: input.body } }, $set: { lastMessageAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!conversation) throw new AppError(404, "Open conversation not found", "CONVERSATION_NOT_FOUND");
    await writeAudit(req, "MESSAGE_SENT", "Conversation", conversation._id, { messageCount: conversation.messages.length });
    res.status(201).json({ data: conversation });
  } catch (error) { next(error); }
});

export const contractRouter = Router();
contractRouter.use(requireAuth);
contractRouter.get("/", requirePermission("contracts:read"), async (req, res, next) => {
  try {
    const contracts = await Contract.find({ hospital: req.auth!.hospitalId })
      .populate("createdBy signedBy", "fullName email")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: contracts });
  } catch (error) { next(error); }
});
contractRouter.post("/", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({ title: z.string().trim().min(2).max(180), body: z.string().trim().min(20).max(30_000) }).strict().parse(req.body);
    const contract = await Contract.create({ ...input, hospital: req.auth!.hospitalId, createdBy: req.auth!.userId, status: "PENDING" });
    await Notification.create({ hospital: req.auth!.hospitalId, type: "CONTRACT", title: "Contract awaiting review", message: input.title, link: "contracts" });
    await writeAudit(req, "CONTRACT_CREATED", "Contract", contract._id, contract.toObject());
    res.status(201).json({ data: contract });
  } catch (error) { next(error); }
});
contractRouter.patch("/:contractId/decision", requirePermission("contracts:sign"), async (req, res, next) => {
  try {
    const params = z.object({ contractId: objectId }).parse(req.params);
    const input = z.discriminatedUnion("decision", [
      z.object({ decision: z.literal("ACCEPTED"), signerName: z.string().trim().min(2).max(140), signatureDataUrl: z.string().max(250_000).default("") }),
      z.object({ decision: z.literal("REJECTED"), rejectionReason: z.string().trim().min(2).max(500) })
    ]).parse(req.body);
    const before = await Contract.findOne({ _id: params.contractId, hospital: req.auth!.hospitalId, status: "PENDING" }).lean();
    if (!before) throw new AppError(404, "Pending contract not found", "CONTRACT_NOT_FOUND");
    const update = input.decision === "ACCEPTED" ? {
      status: input.decision,
      signedBy: req.auth!.userId,
      signerName: input.signerName,
      signatureDataUrl: input.signatureDataUrl,
      signedAt: new Date()
    } : { status: input.decision, rejectionReason: input.rejectionReason };
    const contract = await Contract.findByIdAndUpdate(params.contractId, { $set: update }, { new: true, runValidators: true });
    await writeAudit(req, "CONTRACT_DECIDED", "Contract", contract!._id, { status: contract!.status }, before);
    res.json({ data: contract });
  } catch (error) { next(error); }
});

export const reportRouter = Router();
reportRouter.use(requireAuth);
reportRouter.get("/", requirePermission("reports:read"), async (req, res, next) => {
  try {
    const reports = await Report.find({ hospital: req.auth!.hospitalId }).populate("document createdBy", "name mimeType size fullName email").sort({ periodStart: -1 }).lean();
    res.json({ data: reports });
  } catch (error) { next(error); }
});
reportRouter.post("/", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({
      title: z.string().trim().min(2).max(180),
      reportType: z.enum(["MONTHLY_BILLING", "FINANCIAL", "CLAIMS", "CUSTOM"]),
      periodStart: z.coerce.date(),
      periodEnd: z.coerce.date(),
      summary: z.string().trim().max(3000).default(""),
      documentId: objectId.optional()
    }).strict().parse(req.body);
    if (input.periodEnd < input.periodStart) throw new AppError(400, "Report period is invalid", "INVALID_REPORT_PERIOD");
    if (input.documentId && !await DocumentAsset.exists({ _id: input.documentId, hospital: req.auth!.hospitalId })) {
      throw new AppError(404, "Document not found", "DOCUMENT_NOT_FOUND");
    }
    const report = await Report.create({ ...input, document: input.documentId, hospital: req.auth!.hospitalId, createdBy: req.auth!.userId });
    await Notification.create({ hospital: req.auth!.hospitalId, type: "REPORT", title: "New report available", message: input.title, link: "reports" });
    await writeAudit(req, "REPORT_CREATED", "Report", report._id, report.toObject());
    res.status(201).json({ data: report });
  } catch (error) { next(error); }
});

export const claimRouter = Router();
claimRouter.use(requireAuth);
claimRouter.get("/", requirePermission("claims:read"), async (req, res, next) => {
  try {
    const claims = await Claim.find({ hospital: req.auth!.hospitalId }).sort({ submittedAt: -1 }).lean();
    res.json({ data: claims });
  } catch (error) { next(error); }
});
claimRouter.get("/export.csv", requirePermission("claims:read"), async (req, res, next) => {
  try {
    const claims = await Claim.find({ hospital: req.auth!.hospitalId }).sort({ submittedAt: -1 }).lean();
    const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = ["claimNo,patientName,payerName,amount,status,rejectionReason,submittedAt", ...claims.map((claim) => [claim.claimNo, claim.patientName, claim.payerName, claim.amount.toString(), claim.status, claim.rejectionReason, claim.submittedAt].map(cell).join(","))];
    res.type("text/csv").attachment("claims.csv").send(rows.join("\n"));
  } catch (error) { next(error); }
});
claimRouter.post("/", requirePermission("claims:create"), async (req, res, next) => {
  try {
    const input = z.object({ claimNo: z.string().trim().min(2).max(40), patientName: z.string().trim().min(2).max(160), payerName: z.string().trim().min(2).max(160), amount: money }).strict().parse(req.body);
    const claim = await Claim.create({ ...input, hospital: req.auth!.hospitalId, updatedBy: req.auth!.userId });
    await writeAudit(req, "CLAIM_CREATED", "Claim", claim._id, claim.toObject());
    res.status(201).json({ data: claim });
  } catch (error) { next(error); }
});
claimRouter.patch("/:claimId", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ claimId: objectId }).parse(req.params);
    const input = z.object({ status: z.enum(["SUBMITTED", "PROCESSING", "APPROVED", "REJECTED", "PAID"]), rejectionReason: z.string().trim().max(500).default("") }).strict().parse(req.body);
    if (input.status === "REJECTED" && !input.rejectionReason) throw new AppError(400, "A rejection reason is required", "REJECTION_REASON_REQUIRED");
    const before = await Claim.findOne({ _id: params.claimId, hospital: req.auth!.hospitalId }).lean();
    if (!before) throw new AppError(404, "Claim not found", "CLAIM_NOT_FOUND");
    const claim = await Claim.findByIdAndUpdate(params.claimId, { $set: { ...input, updatedBy: req.auth!.userId } }, { new: true, runValidators: true });
    await writeAudit(req, "CLAIM_STATUS_UPDATED", "Claim", claim!._id, claim!.toObject(), before);
    res.json({ data: claim });
  } catch (error) { next(error); }
});

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      hospital: req.auth!.hospitalId,
      $or: [{ recipient: null }, { recipient: req.auth!.userId }]
    }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ data: notifications.map((notification) => ({ ...notification, isRead: notification.readBy.some((userId) => userId.equals(req.auth!.userId)) })) });
  } catch (error) { next(error); }
});
notificationRouter.patch("/:notificationId/read", async (req, res, next) => {
  try {
    const params = z.object({ notificationId: objectId }).parse(req.params);
    const notification = await Notification.findOneAndUpdate(
      { _id: params.notificationId, hospital: req.auth!.hospitalId, $or: [{ recipient: null }, { recipient: req.auth!.userId }] },
      { $addToSet: { readBy: req.auth!.userId } },
      { new: true }
    );
    if (!notification) throw new AppError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
    res.json({ data: notification });
  } catch (error) { next(error); }
});
