import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  cities: [{ type: String }],
});

export default mongoose.model("Location", locationSchema);
