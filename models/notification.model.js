import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    title: { type: String, required: true },
    body:  { type: String, required: true },
    type: {
      type: String,
      enum: ["queue_reminder", "doctor_on_duty"],
      required: true,
    },
    isRead: { type: Boolean, default: false },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
