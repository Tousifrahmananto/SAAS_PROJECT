import { Schema, model } from "mongoose";

const encounterSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  primaryDepartment: { type: Schema.Types.ObjectId, ref: "Department", required: true },
  encounterNo: { type: String, required: true },
  type: { type: String, enum: ["OPD", "EMERGENCY", "INPATIENT"], required: true },
  status: { type: String, enum: ["OPEN", "CLOSED", "CANCELLED"], default: "OPEN" },
  attendingDoctorName: { type: String, default: "" },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null }
}, { timestamps: true });

encounterSchema.index({ hospital: 1, encounterNo: 1 }, { unique: true });
export const Encounter = model("Encounter", encounterSchema);
