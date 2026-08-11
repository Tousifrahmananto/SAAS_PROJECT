import { Schema, model } from "mongoose";

const chargeSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  encounter: { type: Schema.Types.ObjectId, ref: "Encounter", required: true, index: true },
  department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
  service: { type: Schema.Types.ObjectId, ref: "Service", required: true },
  invoice: { type: Schema.Types.ObjectId, ref: "Invoice", default: null, index: true },
  enteredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitPrice: { type: Schema.Types.Decimal128, required: true },
  grossAmount: { type: Schema.Types.Decimal128, required: true },
  discountAmount: { type: Schema.Types.Decimal128, default: "0" },
  vatAmount: { type: Schema.Types.Decimal128, default: "0" },
  netAmount: { type: Schema.Types.Decimal128, required: true },
  status: { type: String, enum: ["DRAFT", "POSTED", "REVERSED"], default: "POSTED" },
  sourceReference: { type: String, default: "" },
  occurredAt: { type: Date, default: Date.now },
  postedAt: { type: Date, default: Date.now },
  invoicedAt: { type: Date, default: null }
}, { timestamps: true });

export const Charge = model("Charge", chargeSchema);
