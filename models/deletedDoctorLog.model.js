import mongoose from "mongoose";

const deletedDoctorLogSchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    clinic: {
      clinicName: { type: String, default: "" },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
    },
    reason: { type: String, default: "" },
    deletedBy: {
      type: String,
      enum: ["self_requested", "admin"],
      default: "admin",
    },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model("DeletedDoctorLog", deletedDoctorLogSchema);
