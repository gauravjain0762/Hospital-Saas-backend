import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    planType: {
      type: String,
      enum: ["monthly_unlimited", "token_pack"],
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // null means unlimited (used for monthly_unlimited)
    tokens: {
      type: Number,
      default: null,
    },
    // validity in days: 7 = week, 15 = 15 days, 30 = month
    validityDays: {
      type: Number,
      required: true,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);
