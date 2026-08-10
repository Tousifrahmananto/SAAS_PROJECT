import { Schema, model } from "mongoose";

const counterSchema = new Schema({
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
  key: { type: String, required: true },
  value: { type: Number, required: true, default: 0 }
});

counterSchema.index({ hospital: 1, key: 1 }, { unique: true });
export const Counter = model("Counter", counterSchema);

export async function nextSequence(hospital: Schema.Types.ObjectId | unknown, key: string) {
  const counter = await Counter.findOneAndUpdate(
    { hospital, key },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return counter.value;
}
