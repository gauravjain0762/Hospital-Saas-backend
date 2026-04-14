import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, sparse: true },
    password: String,
    phone: { type: String, unique: true },

    otp: String,
    otpExpiry: Date,
    otpVerified: { type: Boolean, default: false },

    experience: Number,

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

    clinic: {
      newClinic: { type: Boolean, default: false },
      googleBusinessLink: String,
      clinicName: String,
      address: String,
      city: String,
      pincode: String,
      consultationFee: Number,
      photos: [String],
    },

    services: [String],

    availability: [
      {
        day: String, // Monday, Tuesday...
        isActive: Boolean,
        slots: [
          {
            startTime: String,
            endTime: String,
          },
        ],
      },
    ],

    bankDetails: {
      gstNumber: String, // optional
      panNumber: String,
      accountNumber: String,
      ifscCode: String,
      accountType: {
        type: String,
        enum: ["savings", "current"],
      },
    },

    documents: {
      medicalLicense: String,
      idProof: String,
      clinicCertificate: String,
  },

    role: {
      type: String,
      enum: ["doctor", "clinic", "admin"],
      default: "doctor",
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
