import { Schema, model } from "mongoose";

const departmentSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  parentDepartment: { type: Schema.Types.ObjectId, ref: "Department", default: null },
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  isChargeSource: { type: Boolean, default: false },
  isCashCounter: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

departmentSchema.index({ hospital: 1, code: 1 }, { unique: true });
export const Department = model("Department", departmentSchema);
