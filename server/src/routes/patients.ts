import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { nextSequence } from "../models/Counter.js";
import { Patient } from "../models/Patient.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export const patientRouter = Router();
patientRouter.use(requireAuth);

patientRouter.get("/", requirePermission("patients:read"), async (req, res, next) => {
  try {
    const query = z.object({ q: z.string().trim().max(80).default("") }).parse(req.query);
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = query.q ? {
      hospital: req.auth!.hospitalId,
      $or: [
        { patientNo: new RegExp(escaped, "i") },
        { fullName: new RegExp(escaped, "i") },
        { phone: new RegExp(escaped, "i") }
      ]
    } : { hospital: req.auth!.hospitalId };
    const patients = await Patient.find(filter).sort({ createdAt: -1 }).limit(25).lean();
    res.json({ data: patients });
  } catch (error) { next(error); }
});

patientRouter.post("/", requirePermission("patients:create"), async (req, res, next) => {
  try {
    const input = z.object({
      fullName: z.string().trim().min(2).max(160),
      dateOfBirth: z.coerce.date(),
      sex: z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]).default("UNKNOWN"),
      phone: z.string().trim().min(7).max(20),
      email: z.union([z.email(), z.literal("")]).transform((value) => value || undefined).optional(),
      nidOrPassport: z.string().trim().max(40).transform((value) => value || undefined).optional()
    }).parse(req.body);
    const sequence = await nextSequence(req.auth!.hospitalId, "patient");
    const patient = await Patient.create({ ...input, hospital: req.auth!.hospitalId, patientNo: `P-${String(sequence).padStart(6, "0")}` });
    await writeAudit(req, "PATIENT_CREATED", "Patient", patient._id, patient.toObject());
    res.status(201).json({ data: patient });
  } catch (error) { next(error); }
});
