import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { passwordResetEmailConfigured, sendPasswordResetEmail } from "../lib/passwordResetEmail.js";
import { Hospital } from "../models/Hospital.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
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
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: "RATE_LIMITED", message: "Too many registration attempts. Try again later." } }
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many password reset attempts. Try again later." } }
});

function createHospitalCode(hospitalName: string) {
  const base = hospitalName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "HOSPITAL";
  return `${base}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

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
      fullName: z.string().trim().min(2).max(120),
      email: z.email(),
      password: z.string().min(12).max(128)
    }).parse(req.body);
    const email = input.email.toLowerCase();

    if (await User.exists({ email })) {
      throw new AppError(409, "An account with this email already exists", "EMAIL_EXISTS");
    }
    const hospital = await Hospital.create({
      code: createHospitalCode(input.hospitalName),
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
      roles: ["PROVIDER_OWNER"],
      permissions: ["organization:read", "organization:update", "staff:manage"],
      status: "ACTIVE"
    });

    res.status(201).json(createSession(user));
  } catch (error) {
    if (hospitalId) await Hospital.findByIdAndDelete(hospitalId).catch(() => undefined);
    next(error);
  }
});

authRouter.post("/forgot-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const input = z.object({ email: z.email() }).parse(req.body);
    if (!passwordResetEmailConfigured()) {
      throw new AppError(503, "Password reset email is not configured", "RESET_EMAIL_UNAVAILABLE");
    }

    const user = await User.findOne({ email: input.email.toLowerCase(), status: "ACTIVE" });
    if (user) {
      await PasswordResetToken.deleteMany({ user: user._id });
      const resetToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(resetToken).digest("hex");
      const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
      const tokenRecord = await PasswordResetToken.create({ user: user._id, tokenHash, expiresAt });

      try {
        await sendPasswordResetEmail(user.email, resetToken);
      } catch (error) {
        await tokenRecord.deleteOne();
        console.error("Password reset email delivery failed", error);
      }
    }

    res.status(202).json({ message: "If an active account exists for that email, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/reset-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const input = z.object({
      token: z.string().regex(/^[a-f0-9]{64}$/i),
      password: z.string().min(12).max(128)
    }).parse(req.body);
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const tokenRecord = await PasswordResetToken.findOneAndUpdate(
      { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );

    if (!tokenRecord) {
      throw new AppError(400, "This password reset link is invalid or has expired", "INVALID_RESET_TOKEN");
    }

    const user = await User.findById(tokenRecord.user);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError(400, "This password reset link is invalid or has expired", "INVALID_RESET_TOKEN");
    }

    user.passwordHash = await bcrypt.hash(input.password, 12);
    await user.save();
    await PasswordResetToken.deleteMany({ user: user._id, _id: { $ne: tokenRecord._id } });

    res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) {
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
