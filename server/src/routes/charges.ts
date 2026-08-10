import { Router } from "express";
import { Decimal } from "decimal.js";
import { Types } from "mongoose";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { Charge } from "../models/Charge.js";
import { Encounter } from "../models/Encounter.js";
import { Service } from "../models/Service.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export const chargeRouter = Router();
chargeRouter.use(requireAuth);

chargeRouter.post("/", requirePermission("charges:create"), async (req, res, next) => {
  try {
    const input = z.object({
      encounterId: z.string().length(24),
      serviceId: z.string().length(24),
      quantity: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).refine(
        (value) => new Decimal(value).greaterThan(0) && new Decimal(value).lessThanOrEqualTo(1000),
        "Quantity must be between 0 and 1000"
      ).default("1"),
      sourceReference: z.string().trim().max(80).default("")
    }).parse(req.body);
    const departmentId = req.auth!.departmentId;
    if (!departmentId && !req.auth!.roles.includes("SUPER_ADMIN")) {
      throw new AppError(403, "A department assignment is required", "DEPARTMENT_REQUIRED");
    }
    const service = await Service.findOne({ _id: input.serviceId, hospital: req.auth!.hospitalId, isActive: true });
    if (!service) throw new AppError(404, "Service not found", "SERVICE_NOT_FOUND");
    if (departmentId && !service.department.equals(departmentId)) {
      throw new AppError(403, "Charges may only be added for your department", "DEPARTMENT_SCOPE_VIOLATION");
    }
    const encounter = await Encounter.exists({ _id: input.encounterId, hospital: req.auth!.hospitalId, status: "OPEN" });
    if (!encounter) throw new AppError(404, "Open encounter not found", "ENCOUNTER_NOT_FOUND");

    const unitPrice = new Decimal(service.standardPrice.toString());
    const vatRate = new Decimal(service.vatRatePercent.toString());
    const gross = unitPrice.mul(input.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const vat = gross.mul(vatRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const net = gross.plus(vat).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const charge = await Charge.create({
      hospital: req.auth!.hospitalId,
      encounter: new Types.ObjectId(input.encounterId),
      department: departmentId ?? service.department,
      service: service._id,
      enteredBy: req.auth!.userId,
      quantity: input.quantity.toString(),
      unitPrice: unitPrice.toFixed(2),
      grossAmount: gross.toFixed(2),
      vatAmount: vat.toFixed(2),
      netAmount: net.toFixed(2),
      sourceReference: input.sourceReference
    });
    await writeAudit(req, "CHARGE_POSTED", "Charge", charge._id, charge.toObject());
    res.status(201).json({ data: charge });
  } catch (error) { next(error); }
});
