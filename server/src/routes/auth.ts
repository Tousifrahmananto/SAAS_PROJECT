import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { Hospital } from "../models/Hospital.js";
import { User } from "../models/User.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: "RATE_LIMITED", message: "Too many failed sign-in attempts. Try again later." } }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many registration attempts. Try again later." } }
});

function createSession(user: InstanceType<typeof User>) {
  const token = jwt.sign({
    hospitalId: user.hospital.toString(),
    departmentId: user.department?.toString() ?? null,
    roles: user.roles,
    permissions: user.permissions
  }, env.JWT_SECRET, { subject: user.id, expiresIn: "8h", issuer: "hospital-billing-api" });

  return {
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, roles: user.roles, permissions: user.permissions }
  };
}

authRouter.post("/register", registrationLimiter, async (req, res, next) => {
  let hospitalId: string | null = null;
  try {
    const input = z.object({
      hospitalName: z.string().trim().min(2).max(120),
      hospitalCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/),
      fullName: z.string().trim().min(2).max(120),
      email: z.email(),
      password: z.string().min(12).max(128)
    }).parse(req.body);
    const email = input.email.toLowerCase();

    if (await User.exists({ email })) {
      throw new AppError(409, "An account with this email already exists", "EMAIL_EXISTS");
    }
    if (await Hospital.exists({ code: input.hospitalCode })) {
      throw new AppError(409, "This hospital code is already in use", "HOSPITAL_CODE_EXISTS");
    }

    const hospital = await Hospital.create({
      code: input.hospitalCode,
      name: input.hospitalName,
      email,
      currencyCode: "BDT",
      timezone: "Asia/Dhaka",
      isActive: true
    });
    hospitalId = hospital.id;

    const user = await User.create({
      hospital: hospital._id,
      department: null,
      employeeNo: "ADMIN-001",
      fullName: input.fullName,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      roles: ["SUPER_ADMIN"],
      permissions: [],
      status: "ACTIVE"
    });

    res.status(201).json(createSession(user));
  } catch (error) {
    if (hospitalId) await Hospital.findByIdAndDelete(hospitalId).catch(() => undefined);
    next(error);
  }
});

authRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const input = z.object({ email: z.email(), password: z.string().min(8).max(128) }).parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
    if (!user || user.status !== "ACTIVE" || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    user.lastLoginAt = new Date();
    await user.save();
    res.json(createSession(user));
  } catch (error) {
    next(error);
  }
});
