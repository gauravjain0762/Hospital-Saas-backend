import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true,
    },

    fullName: String,
    email: String,
    profilePhoto: String,
    address: String,
    city: String,
    state: String,
    fcmToken: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Patient", patientSchema);
