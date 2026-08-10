import type { Types } from "mongoose";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: Types.ObjectId;
        hospitalId: Types.ObjectId;
        departmentId: Types.ObjectId | null;
        roles: string[];
        permissions: string[];
      };
      correlationId?: string;
    }
  }
}

export {};
