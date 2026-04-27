import mongoose from "mongoose";

const patientReportSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["Appointment", "Account", "Billing", "Other"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
  },
  { timestamps: true }
);

patientReportSchema.pre("save", async function (next) {
  if (!this.ticketId) {
    const count = await mongoose.model("PatientReport").countDocuments();
    this.ticketId = "PTKT" + String(count + 1).padStart(5, "0");
  }
  next();
});

export default mongoose.model("PatientReport", patientReportSchema);
