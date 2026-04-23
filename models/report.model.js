import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

// auto-generate ticket ID before saving
reportSchema.pre("save", async function (next) {
  if (!this.ticketId) {
    const count = await mongoose.model("Report").countDocuments();
    this.ticketId = "TKT" + String(count + 1).padStart(5, "0");
  }
  next();
});

export default mongoose.model("Report", reportSchema);
