import { Schema, model } from "mongoose";

const patientSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  patientNo: { type: String, required: true, trim: true },
  fullName: { type: String, required: true, trim: true, index: true },
  dateOfBirth: { type: Date, required: true },
  sex: { type: String, enum: ["MALE", "FEMALE", "OTHER", "UNKNOWN"], default: "UNKNOWN" },
  phone: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  nidOrPassport: { type: String, trim: true, default: "" },
  address: { type: String, default: "" },
  emergencyContact: {
    name: { type: String, default: "" },
    phone: { type: String, default: "" }
  }
}, { timestamps: true });

patientSchema.index({ hospital: 1, patientNo: 1 }, { unique: true });
patientSchema.index({ hospital: 1, phone: 1 });
patientSchema.index({ hospital: 1, nidOrPassport: 1 }, { sparse: true });
export const Patient = model("Patient", patientSchema);
