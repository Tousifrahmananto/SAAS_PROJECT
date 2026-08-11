import { Schema, model } from "mongoose";

const hospitalSchema = new Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  address: { type: String, default: "" },
  district: { type: String, default: "" },
  phone: { type: String, default: "" },
  email: { type: String, lowercase: true, trim: true },
  website: { type: String, default: "" },
  contactPersonName: { type: String, default: "" },
  registrationNumber: { type: String, default: "" },
  binTin: { type: String, default: "" },
  organizationType: { type: String, enum: ["HOSPITAL", "CLINIC", "BILLING_PROVIDER", "OTHER"], default: "HOSPITAL" },
  status: { type: String, enum: ["PENDING", "APPROVED", "SUSPENDED", "DEACTIVATED"], default: "PENDING", index: true },
  currencyCode: { type: String, default: "BDT" },
  timezone: { type: String, default: "Asia/Dhaka" },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Hospital = model("Hospital", hospitalSchema);
