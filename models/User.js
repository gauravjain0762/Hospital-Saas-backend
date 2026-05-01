import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
    },
    password: String,
    phone: { type: String, unique: true },
    profilePhoto: {
      type: String,
      default: "",
    },

    otp: String,
    otpExpiry: Date,
    otpVerified: { type: Boolean, default: false },

    secondaryPhone: { type: String, default: "" },
    secondaryOtp: String,
    secondaryOtpExpiry: Date,

    experience: Number,

    gender: {
      type: String,
      enum: ["male", "female"],
    },

    registrationStep: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    activeStatus: {
  type: String,
  enum: ["active", "inactive"],
  default: "inactive",
},

    doctorAvailable: {
      type: Boolean,
      default: false,
    },

    fcmToken: {
      type: String,
      default: "",
    },

rejections: {
  type: [
    {
      step: Number,
      reason: String,
    },
  ],
  default: [],
},

    clinic: {
      newClinic: { type: Boolean, default: false },
      googleBusinessLink: String,
      clinicName: String,
      address: String,
      about: String,
      city: String,
      state: String,
      pincode: String,
      consultationFee: Number,
      freeFollowupDays: { type: Number, default: 0 },
      rating: { type: Number, default: 0 },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      photos: [String],
    },

    qualifications: [String],

    services: [String],

    availability: [
      {
        day: String,
        isActive: Boolean,
        slots: [
          {
            startTime: String,
            endTime: String,
          },
        ],
      },
    ],

    maxPatientsPerSlot: {
      type: Number,
      default: null,
    },

    paymentDetails: {
      upiId: String,
      qrCode: String,
    },

    documents: {
      aadharFront: String,
      aadharBack: String,
      panCard: String,
    },

    awards: [String],
    achievements: [String],

    role: {
      type: String,
      enum: ["doctor", "clinic", "admin"],
      default: "doctor",
    },
  },
  { timestamps: true }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  }
);

export default mongoose.model("User", userSchema);
