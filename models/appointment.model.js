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
    required: true,
  },

  slot: {
    type: String,
    required: true,
  },

  visitTime: String,

  tokenNumber: {
    type: Number,
    required: true,
  },

  fullName: String,
  email: String,
  phone: String,

  problem: String,

  paymentMethod: {
    type: String,
    enum: ["online", "cash"],
    default: "cash",
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "cash_pending"],
    default: "cash_pending",
  },

  consultationFee: {
    type: Number,
    default: 0,
  },

  isFollowup: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: [
      "waiting",
      "in_progress",
      "completed",
      "cancelled",
      "skipped"
    ],
    default: "waiting",
  },

  completedAt: Date,
  paidAt: Date,
},
{ timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);