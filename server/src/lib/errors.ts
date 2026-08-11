import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "REQUEST_FAILED"
  ) {
    super(message);
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, `Route ${req.method} ${req.path} was not found`, "NOT_FOUND"));
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.issues } });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
    res.status(409).json({ error: { code: "DUPLICATE_RECORD", message: "A record with these unique details already exists" } });
    return;
  }
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The uploaded request is too large" } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
}
