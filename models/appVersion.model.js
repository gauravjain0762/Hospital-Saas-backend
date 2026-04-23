import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
  {
    appType: {
      type: String,
      enum: ["doctor", "patient"],
      required: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android"],
      required: true,
    },
    latestVersion: {
      type: String,
      required: true,
    },
    minVersion: {
      type: String,
      required: true,
    },
    forceUpdate: {
      type: Boolean,
      default: false,
    },
    storeUrl: {
      type: String,
      default: "",
    },
    releaseNotes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// one document per appType + platform combination
appVersionSchema.index({ appType: 1, platform: 1 }, { unique: true });

export default mongoose.model("AppVersion", appVersionSchema);
