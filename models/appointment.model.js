import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
{
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },

  date: {
    type: String,
    required: true, // YYYY-MM-DD
  },

  tokenNumber: Number,

  status: {
    type: String,
    enum: ["waiting", "completed", "cancelled"],
    default: "waiting",
  },

  consultationFee: {
    type: Number,
    default: 0,
  },

  isFollowup: {
    type: Boolean,
    default: false,
  },

  completedAt: Date,
},
{ timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);