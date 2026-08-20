import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Hospital } from "../models/Hospital.js";
import { Appointment, Contract, DocumentAsset, Invoice, Report } from "../models/Portal.js";
import { User } from "../models/User.js";

export const organizationRouter = Router();
organizationRouter.use(requireAuth);

organizationRouter.get("/admin/overview", requireRole("ADMIN", "SUPER_ADMIN"), async (_req, res, next) => {
  try {
    const organizations = await Hospital.find({}).sort({ createdAt: -1 }).lean();
    const data = await Promise.all(organizations.map(async (organization) => {
      const [staff, documents, appointments, invoices, reports, contracts] = await Promise.all([
        User.countDocuments({ hospital: organization._id }),
        DocumentAsset.countDocuments({ hospital: organization._id }),
        Appointment.countDocuments({ hospital: organization._id }),
        Invoice.countDocuments({ hospital: organization._id }),
        Report.countDocuments({ hospital: organization._id }),
        Contract.countDocuments({ hospital: organization._id })
      ]);
      return { ...organization, counts: { staff, documents, appointments, invoices, reports, contracts } };
    }));
    res.json({ data, summary: {
      organizations: data.length,
      pending: data.filter((item) => item.status === "PENDING").length,
      active: data.filter((item) => item.status === "APPROVED").length,
      staff: data.reduce((sum, item) => sum + item.counts.staff, 0),
      invoices: data.reduce((sum, item) => sum + item.counts.invoices, 0)
    } });
  } catch (error) { next(error); }
});

organizationRouter.get("/admin/resources/:resource", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ resource: z.enum(["staff", "documents", "appointments", "invoices", "reports", "contracts"]) }).parse(req.params);
    let records;
    if (params.resource === "staff") records = await User.find({}).select("fullName email employeeNo roles status hospital createdAt").populate("hospital", "code name").sort({ createdAt: -1 }).limit(500).lean();
    else if (params.resource === "documents") records = await DocumentAsset.find({}).select("name category mimeType size hospital createdAt").populate("hospital", "code name").sort({ createdAt: -1 }).limit(500).lean();
    else if (params.resource === "appointments") records = await Appointment.find({}).select("subject startsAt durationMinutes status hospital createdAt").populate("hospital", "code name").sort({ startsAt: -1 }).limit(500).lean();
    else if (params.resource === "invoices") records = await Invoice.find({}).select("invoiceNo patientName status totalAmount dueAmount hospital createdAt").populate("hospital", "code name").sort({ createdAt: -1 }).limit(500).lean();
    else if (params.resource === "reports") records = await Report.find({}).select("title reportType periodStart periodEnd hospital createdAt").populate("hospital", "code name").sort({ createdAt: -1 }).limit(500).lean();
    else records = await Contract.find({}).select("title version status signerName hospital createdAt").populate("hospital", "code name").sort({ createdAt: -1 }).limit(500).lean();
    res.json({ data: records });
  } catch (error) { next(error); }
});

organizationRouter.patch("/admin/staff/:userId/status", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ userId: z.string().length(24) }).parse(req.params);
    const input = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]) }).strict().parse(req.body);
    const user = await User.findByIdAndUpdate(params.userId, { $set: input }, { new: true, runValidators: true }).select("-passwordHash");
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    await writeAudit(req, "PLATFORM_USER_STATUS_UPDATED", "User", user._id, { status: user.status });
    res.json({ data: user });
  } catch (error) { next(error); }
});

organizationRouter.patch(
  "/:organizationId/status",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const params = z.object({ organizationId: z.string().length(24) }).parse(req.params);
      const input = z.object({ status: z.enum(["PENDING", "APPROVED", "SUSPENDED", "DEACTIVATED"]) }).strict().parse(req.body);
      const before = await Hospital.findById(params.organizationId).lean();
      if (!before) throw new AppError(404, "Organization not found", "ORGANIZATION_NOT_FOUND");
      const organization = await Hospital.findByIdAndUpdate(
        params.organizationId,
        { $set: { status: input.status, isActive: input.status !== "DEACTIVATED" } },
        { new: true, runValidators: true }
      );
      if (!organization) throw new AppError(404, "Organization not found", "ORGANIZATION_NOT_FOUND");
      await writeAudit(req, "ORGANIZATION_STATUS_UPDATED", "Hospital", organization._id, organization.toObject(), before);
      res.json({ data: organization });
    } catch (error) { next(error); }
  }
);

organizationRouter.get("/me", async (req, res, next) => {
  try {
    const organization = await Hospital.findOne({
      _id: req.auth!.hospitalId,
      isActive: true
    }).lean();
    if (!organization) throw new AppError(404, "Organization not found", "ORGANIZATION_NOT_FOUND");
    res.json({
      data: {
        ...organization,
        organizationType: organization.organizationType ?? "HOSPITAL",
        status: organization.status ?? "PENDING"
      }
    });
  } catch (error) {
    next(error);
  }
});

organizationRouter.patch(
  "/me",
  requireRole("PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const input = z.object({
        name: z.string().trim().min(2).max(120).optional(),
        organizationType: z.enum(["HOSPITAL", "CLINIC", "BILLING_PROVIDER", "OTHER"]).optional(),
        address: z.string().trim().max(300).optional(),
        district: z.string().trim().max(80).optional(),
        phone: z.union([z.string().trim().min(7).max(20), z.literal("")]).optional(),
        email: z.union([z.email(), z.literal("")]).optional(),
        website: z.union([z.url(), z.literal("")]).optional(),
        contactPersonName: z.string().trim().max(120).optional(),
        registrationNumber: z.string().trim().max(80).optional(),
        binTin: z.string().trim().max(80).optional()
      }).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required").parse(req.body);

      const before = await Hospital.findOne({
        _id: req.auth!.hospitalId,
        isActive: true,
        status: { $nin: ["SUSPENDED", "DEACTIVATED"] }
      }).lean();
      if (!before) throw new AppError(409, "This organization cannot currently be edited", "ORGANIZATION_NOT_EDITABLE");

      const organization = await Hospital.findByIdAndUpdate(
        req.auth!.hospitalId,
        {
          $set: {
            ...input,
            status: before.status ?? "PENDING",
            organizationType: input.organizationType ?? before.organizationType ?? "HOSPITAL"
          }
        },
        { new: true, runValidators: true }
      );
      if (!organization) throw new AppError(404, "Organization not found", "ORGANIZATION_NOT_FOUND");

      await writeAudit(
        req,
        "ORGANIZATION_UPDATED",
        "Hospital",
        organization._id,
        organization.toObject(),
        before
      );
      res.json({ data: organization });
    } catch (error) {
      next(error);
    }
  }
);
