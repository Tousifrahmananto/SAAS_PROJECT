import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.correlationId = req.header("x-correlation-id") || randomUUID();
  res.setHeader("x-correlation-id", req.correlationId);
  next();
}
