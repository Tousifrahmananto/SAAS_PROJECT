import { Router } from "express";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { Department } from "../models/Department.js";
import { Service } from "../models/Service.js";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const money = z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => new Decimal(value).greaterThanOrEqualTo(0));
const percentage = money.refine((value) => new Decimal(value).lessThanOrEqualTo(100), "Percentage cannot exceed 100");

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get("/departments", requirePermission("catalog:read"), async (req, res, next) => {
  try { res.json({ data: await Department.find({ hospital: req.auth!.hospitalId, isActive: true }).sort({ name: 1 }).lean() }); }
  catch (error) { next(error); }
});
catalogRouter.post("/departments", requireRole("PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(120), type: z.string().trim().min(2).max(30), isChargeSource: z.boolean().default(true), isCashCounter: z.boolean().default(false) }).strict().parse(req.body);
    const code = input.code.toUpperCase();
    if (await Department.exists({ hospital: req.auth!.hospitalId, code })) {
      throw new AppError(409, `A department with code "${code}" already exists in this hospital`, "DUPLICATE_DEPARTMENT_CODE");
    }
    const department = await Department.create({ ...input, code, hospital: req.auth!.hospitalId });
    await writeAudit(req, "DEPARTMENT_CREATED", "Department", department._id, department.toObject());
    res.status(201).json({ data: department });
  } catch (error) { next(error); }
});
catalogRouter.get("/services", requirePermission("catalog:read"), async (req, res, next) => {
  try { res.json({ data: await Service.find({ hospital: req.auth!.hospitalId, isActive: true }).populate("department", "code name").sort({ name: 1 }).lean() }); }
  catch (error) { next(error); }
});
catalogRouter.post("/services", requireRole("PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({ departmentId: objectId, code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(180), category: z.string().trim().min(2).max(40), standardPrice: money, vatRatePercent: percentage.default("0") }).strict().parse(req.body);
    const code = input.code.toUpperCase();
    if (await Service.exists({ hospital: req.auth!.hospitalId, code })) {
      throw new AppError(409, `A service with code "${code}" already exists in this hospital`, "DUPLICATE_SERVICE_CODE");
    }
    if (!await Department.exists({ _id: input.departmentId, hospital: req.auth!.hospitalId, isActive: true })) {
      throw new AppError(404, "Active department not found in this hospital", "DEPARTMENT_NOT_FOUND");
    }
    const service = await Service.create({ ...input, code, department: input.departmentId, hospital: req.auth!.hospitalId });
    await writeAudit(req, "SERVICE_CREATED", "Service", service._id, service.toObject());
    res.status(201).json({ data: service });
  } catch (error) { next(error); }
});
