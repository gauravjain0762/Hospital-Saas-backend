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

  date: String,
  time: String,

  tokenNumber: Number,

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
    default: "pending",
  },

  consultationFee: Number,

  isFollowup: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: ["waiting", "in_progress", "completed", "cancelled"],
    default: "waiting",
  },

  completedAt: Date,
},
{ timestamps: true }
);

export default mongoose.model("Appointment", appointmentSchema);