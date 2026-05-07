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
      enum: ["monthly_unlimited", "pay_per_token"],
      required: true,
    },

    // monthly_unlimited: fixed monthly price
    price: {
      type: Number,
      default: null,
    },
    // monthly_unlimited: how many days the plan lasts
    validityDays: {
      type: Number,
      default: null,
    },

    // pay_per_token: rupees deducted per appointment token
    pricePerToken: {
      type: Number,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);
