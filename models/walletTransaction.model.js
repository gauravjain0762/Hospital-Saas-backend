
import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["recharge", "deduct"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ doctorId: 1, createdAt: -1 });

export default mongoose.model("WalletTransaction", walletTransactionSchema);
