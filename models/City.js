import mongoose from "mongoose";

const citySchema = new mongoose.Schema({
  name: { type: String, required: true },
  state: { type: mongoose.Schema.Types.ObjectId, ref: "State", required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("City", citySchema);
