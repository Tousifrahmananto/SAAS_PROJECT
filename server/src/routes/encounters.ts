import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { nextSequence } from "../models/Counter.js";
import { Encounter } from "../models/Encounter.js";
import { Patient } from "../models/Patient.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export const encounterRouter = Router();
encounterRouter.use(requireAuth);

encounterRouter.post("/", requirePermission("encounters:create"), async (req, res, next) => {
  try {
    const input = z.object({
      patientId: z.string().length(24),
      primaryDepartmentId: z.string().length(24),
      type: z.enum(["OPD", "EMERGENCY", "INPATIENT"]),
      attendingDoctorName: z.string().trim().max(140).default("")
    }).parse(req.body);
    const patient = await Patient.exists({ _id: input.patientId, hospital: req.auth!.hospitalId });
    if (!patient) throw new AppError(404, "Patient not found", "PATIENT_NOT_FOUND");
    const sequence = await nextSequence(req.auth!.hospitalId, "encounter");
    const encounter = await Encounter.create({
      hospital: req.auth!.hospitalId,
      patient: input.patientId,
      primaryDepartment: input.primaryDepartmentId,
      encounterNo: `E-${new Date().getFullYear()}-${String(sequence).padStart(6, "0")}`,
      type: input.type,
      attendingDoctorName: input.attendingDoctorName
    });
    await writeAudit(req, "ENCOUNTER_OPENED", "Encounter", encounter._id, encounter.toObject());
    res.status(201).json({ data: encounter });
  } catch (error) { next(error); }
});
