import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { User } from "../models/User.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = z.object({ email: z.email(), password: z.string().min(8).max(128) }).parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
    if (!user || user.status !== "ACTIVE" || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    user.lastLoginAt = new Date();
    await user.save();
    const token = jwt.sign({
      hospitalId: user.hospital.toString(),
      departmentId: user.department?.toString() ?? null,
      roles: user.roles,
      permissions: user.permissions
    }, env.JWT_SECRET, { subject: user.id, expiresIn: "8h", issuer: "hospital-billing-api" });

    res.json({
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, roles: user.roles, permissions: user.permissions }
    });
  } catch (error) {
    next(error);
  }
});
