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

    employees: {
      type: [
        {
          name: { type: String, required: true },
          phone: { type: String, required: true },
          otp: String,
          otpExpiry: Date,
          verified: { type: Boolean, default: false },
          accountType: { type: String, default: "employee" },
        },
      ],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 2,
        message: "Maximum 2 employees allowed",
      },
    },

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

    deletionRequested: { type: Boolean, default: false },
    deletionReason: { type: String, default: "" },
    deletionRequestedAt: { type: Date, default: null },

    doctorAvailable: {
      type: Boolean,
      default: false,
    },

    fcmToken: {
      type: String,
      default: "",
    },

    tokenVersion: {
      type: Number,
      default: 0,
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
      country: String,
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
      default: 12,
    },

    paymentDetails: {
      paymentMethod: {
        type: String,
        enum: ["cash", "online", "both"],
      },
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

    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      default: null,
    },

    role: {
      type: String,
      enum: ["doctor", "clinic", "admin"],
      default: "doctor",
    },

    wallet: {
      balance: { type: Number, default: 0 },
    },

    tokenPlan: {
      planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", default: null },
      planType: {
        type: String,
        enum: ["free", "monthly_unlimited", "pay_per_token"],
        default: "free",
      },
      // monthly_unlimited fields
      isUnlimited: { type: Boolean, default: false },
      validFrom: { type: Date, default: null },
      validUntil: { type: Date, default: null },
      // free / monthly_unlimited token tracking
      totalTokens: { type: Number, default: 0 },
      // pay_per_token: cost per appointment deducted from wallet
      pricePerToken: { type: Number, default: null },
      // all plans: usage tracking
      usedTokens: { type: Number, default: 0 },
      grantedAt: { type: Date, default: null },
      // monthly_unlimited: auto-renewal toggle
      autoRenew: { type: Boolean, default: true },
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
