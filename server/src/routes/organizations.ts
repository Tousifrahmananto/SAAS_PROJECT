import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Hospital } from "../models/Hospital.js";

export const organizationRouter = Router();
organizationRouter.use(requireAuth);

organizationRouter.get(
  "/",
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (_req, res, next) => {
    try {
      const organizations = await Hospital.find({}).sort({ createdAt: -1 }).lean();
      res.json({ data: organizations });
    } catch (error) { next(error); }
  }
);

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
