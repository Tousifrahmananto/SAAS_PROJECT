import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

interface TokenPayload extends jwt.JwtPayload {
  sub: string;
  hospitalId: string;
  departmentId?: string | null;
  roles: string[];
  permissions: string[];
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) return next(new AppError(401, "Authentication required", "UNAUTHENTICATED"));

  try {
    const payload = jwt.verify(value.slice(7), env.JWT_SECRET) as TokenPayload;
    if (!payload.sub || !payload.hospitalId) throw new Error("Invalid token payload");
    req.auth = {
      userId: new Types.ObjectId(payload.sub),
      hospitalId: new Types.ObjectId(payload.hospitalId),
      departmentId: payload.departmentId ? new Types.ObjectId(payload.departmentId) : null,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? []
    };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired access token", "INVALID_TOKEN"));
  }
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new AppError(401, "Authentication required", "UNAUTHENTICATED"));
    if (req.auth.roles.includes("SUPER_ADMIN") || req.auth.roles.includes("ADMIN") || req.auth.permissions.includes(permission)) return next();
    next(new AppError(403, `Permission ${permission} is required`, "FORBIDDEN"));
  };
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new AppError(401, "Authentication required", "UNAUTHENTICATED"));
    if (req.auth.roles.some((role) => allowedRoles.includes(role))) return next();
    next(new AppError(403, "Your account role cannot perform this action", "FORBIDDEN"));
  };
}
