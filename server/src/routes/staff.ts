import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { User } from "../models/User.js";

export const staffRouter = Router();
staffRouter.use(requireAuth);

staffRouter.get("/", requirePermission("staff:read"), async (req, res, next) => {
  try {
    const staff = await User.find({ hospital: req.auth!.hospitalId })
      .select("fullName email phone employeeNo roles permissions status department lastLoginAt createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: staff });
  } catch (error) { next(error); }
});

staffRouter.post("/", requireRole("PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({
      fullName: z.string().trim().min(2).max(140),
      email: z.email(),
      phone: z.string().trim().max(20).default(""),
      employeeNo: z.string().trim().min(2).max(30),
      password: z.string().min(12).max(128),
      role: z.enum(["PROVIDER_STAFF", "ADMIN"]).default("PROVIDER_STAFF"),
      permissions: z.array(z.string().trim().min(3).max(80)).max(30).default([])
    }).strict().parse(req.body);
    if (input.role === "ADMIN" && !req.auth!.roles.some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role))) {
      throw new AppError(403, "Only an administrator can create another administrator", "FORBIDDEN");
    }
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) throw new AppError(409, "A user with this email already exists", "EMAIL_IN_USE");
    if (await User.exists({ hospital: req.auth!.hospitalId, employeeNo: input.employeeNo })) {
      throw new AppError(409, `An employee with number "${input.employeeNo}" already exists`, "DUPLICATE_EMPLOYEE_NO");
    }
    const staff = await User.create({
      hospital: req.auth!.hospitalId,
      employeeNo: input.employeeNo,
      fullName: input.fullName,
      email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 12),
      roles: [input.role],
      permissions: input.permissions,
      status: "ACTIVE",
      requiresPasswordChange: true
    });
    await writeAudit(req, "STAFF_CREATED", "User", staff._id, staff.toObject());
    res.status(201).json({ data: await User.findById(staff._id).select("-passwordHash").lean() });
  } catch (error) { next(error); }
});

staffRouter.patch("/:staffId", requireRole("PROVIDER_OWNER", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ staffId: z.string().length(24) }).parse(req.params);
    const input = z.object({
      fullName: z.string().trim().min(2).max(140).optional(),
      phone: z.string().trim().max(20).optional(),
      status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]).optional(),
      permissions: z.array(z.string().trim().min(3).max(80)).max(30).optional()
    }).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required").parse(req.body);
    const before = await User.findOne({ _id: params.staffId, hospital: req.auth!.hospitalId }).lean();
    if (!before) throw new AppError(404, "Staff member not found", "STAFF_NOT_FOUND");
    if (before.roles.includes("PROVIDER_OWNER") && !req.auth!.roles.includes("SUPER_ADMIN")) {
      throw new AppError(403, "The provider owner account cannot be modified here", "FORBIDDEN");
    }
    const staff = await User.findOneAndUpdate(
      { _id: params.staffId, hospital: req.auth!.hospitalId },
      { $set: input },
      { new: true, runValidators: true }
    ).select("-passwordHash");
    if (!staff) throw new AppError(404, "Staff member not found", "STAFF_NOT_FOUND");
    await writeAudit(req, "STAFF_UPDATED", "User", staff._id, staff.toObject(), before);
    res.json({ data: staff });
  } catch (error) { next(error); }
});
