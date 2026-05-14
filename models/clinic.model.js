import mongoose from "mongoose";

const clinicSchema = new mongoose.Schema(
  {
    clinicName: { type: String, required: true },
    address:    { type: String, default: "" },
    city:       { type: String, default: "" },
    state:      { type: String, default: "" },
    pincode:    { type: String, default: "" },
    country:    { type: String, default: "" },
    phone:      { type: String, default: "" },
    photos:     [String],
  },
  { timestamps: true }
);

export default mongoose.model("Clinic", clinicSchema);
