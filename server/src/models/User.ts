import { Schema, model } from "mongoose";

export const userRoles = [
  "PROVIDER_OWNER",
  "PROVIDER_STAFF",
  "ADMIN",
  "SUPER_ADMIN",
  "BILLING_ADMIN",
  "CASHIER",
  "DEPARTMENT_STAFF",
  "DOCTOR"
] as const;

const userSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", default: null, index: true },
  employeeNo: { type: String, required: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: "" },
  passwordHash: { type: String, required: true, select: false },
  roles: [{ type: String, enum: userRoles, required: true }],
  permissions: [{ type: String, trim: true }],
  mfaEnabled: { type: Boolean, default: false },
  status: { type: String, enum: ["ACTIVE", "SUSPENDED", "DISABLED"], default: "ACTIVE" },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.index({ hospital: 1, employeeNo: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
export const User = model("User", userSchema);
