import mongoose from "mongoose";

const legalContentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["terms_doctor", "terms_patient", "privacy_policy_doctor", "privacy_policy_patient"],
      unique: true,
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("LegalContent", legalContentSchema);
