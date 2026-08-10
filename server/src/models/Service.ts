import { Schema, model } from "mongoose";

const serviceSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true },
  unitName: { type: String, default: "service" },
  standardPrice: { type: Schema.Types.Decimal128, required: true },
  vatRatePercent: { type: Schema.Types.Decimal128, default: "0" },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

serviceSchema.index({ hospital: 1, code: 1 }, { unique: true });
export const Service = model("Service", serviceSchema);
