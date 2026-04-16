import User from "../models/User.js";
import { generateOtp } from "../utils/generateOtp.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";
import Service from "../models/Service.js";



// ✅ SEND OTP
export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    // Duplicate phone check
const existingUser = await User.findOne({ 
  phone, 
  otpVerified: true  // only block if they've actually completed registration
});

if (existingUser) {
  return res.status(400).json({ 
    message: "This mobile number is already registered. Please use a different number." 
  });
}

    const fixedOtp = process.env.FIXED_OTP?.trim();
    const otp = fixedOtp || generateOtp();

    await User.findOneAndUpdate(
      { phone },
      {
        $set: {
          otp,
          otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("OTP:", otp); // 🔥 for testing

    res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// ✅ VERIFY OTP
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (otp === undefined || otp === null || String(otp).trim() === "") {
      return res.status(400).json({ message: "Please enter otp" });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (String(user.otp) !== String(otp) || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.otpVerified = true;
    user.otp = null;
    await user.save();

    // generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "OTP verified",
      token,
      user: {
        id: user._id,
        registrationStep: user.registrationStep,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// ✅ STEP 1 REGISTER
export const registerStep1 = async (req, res) => {
  try {
    const { name, email, phone, experience } = req.body;

    const user = await User.findOne({ phone });

    if (!user || !user.otpVerified) {
      return res.status(400).json({
        message: "Please verify OTP first",
      });
    }

    user.name = name;
    user.email = email;
    user.experience = experience;
    user.registrationStep = 1;

    user.rejections = user.rejections.filter(r => r.step !== 1);

    await user.save();

    res.json({
      success: true,
      message: "Step 1 completed",
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ STEP 2 REGISTER
export const registerStep2 = async (req, res) => {
  try {
    const {
      newClinic,
      googleBusinessLink,
      clinicName,
      about,
      address,
      city,
      pincode,
      consultationFee,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.registrationStep < 1) {
      return res.status(400).json({
        message: "Complete step 1 first",
      });
    }

    let photoUrls = [];

    if (req.files && req.files.length > 0) {
      photoUrls = req.files.map(file => file.path);
    }

    user.clinic = {
      newClinic: newClinic === true || newClinic === "true",
      googleBusinessLink,
      clinicName,
      about,
      address,
      city,
      pincode,
      consultationFee,
      photos: photoUrls,
    };

    user.rejections = user.rejections.filter(r => r.step !== 2);

    user.registrationStep = 2;

    await user.save();

    res.json({
      success: true,
      message: "Step 2 completed",
      clinic: user.clinic,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const registerStep3 = async (req, res) => {
  try {
    const { services, availability } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.registrationStep < 2) {
      return res.status(400).json({
        message: "Complete step 2 first",
      });
    }
    
    //save services
    if (services && services.length > 0) {
      for (let serviceName of services) {
        await Service.findOneAndUpdate(
          { name: serviceName },
          { name: serviceName },
          { upsert: true, new: true }
        );
      }
    }

    //save in user
    user.services = services;
    user.availability = availability;
    user.registrationStep = 3;

    user.rejections = user.rejections.filter(r => r.step !== 3);

    await user.save();

    res.json({
      success: true,
      message: "Step 3 completed",
      data: {
        services: user.services,
        availability: user.availability,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getServices = async (req, res) => {
  try {
    const services = await Service.find().sort({ name: 1 });

    res.json({
      success: true,
      services,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const registerStep4 = async (req, res) => {
  try {
    const {
      gstNumber,
      panNumber,
      accountNumber,
      ifscCode,
      accountType,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.registrationStep < 3) {
      return res.status(400).json({
        message: "Complete step 3 first",
      });
    }

    // 🔥 Basic validations
    if (!panNumber || !accountNumber || !ifscCode || !accountType) {
      return res.status(400).json({
        message: "Required fields missing",
      });
    }

    // PAN validation (simple)
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panNumber)) {
      return res.status(400).json({
        message: "Invalid PAN format",
      });
    }

    // IFSC validation (simple)
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode)) {
      return res.status(400).json({
        message: "Invalid IFSC code",
      });
    }

    // Account type validation
    if (!["savings", "current"].includes(accountType)) {
      return res.status(400).json({
        message: "Invalid account type",
      });
    }

    // Account number duplicate check
const existingAccount = await User.findOne({
  "bankDetails.accountNumber": accountNumber,
  _id: { $ne: req.user._id }, // exclude current user
});

if (existingAccount) {
  return res.status(400).json({
    message: "This account number is already registered. Please enter a valid account number.",
  });
}

    //  Save data
    user.bankDetails = {
      gstNumber,
      panNumber,
      accountNumber,
      ifscCode,
      accountType,
    };

    user.rejections = user.rejections.filter(r => r.step !== 4);

    user.registrationStep = 4;

    await user.save();

    res.json({
      success: true,
      message: "Step 4 completed",
      bankDetails: user.bankDetails,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const registerStep5 = async (req, res) => {
  try {
    console.log("FILES:", req.files);

    const user = await User.findById(req.user._id);

    if (!user || user.registrationStep < 4) {
      return res.status(400).json({
        message: "Complete step 4 first",
      });
    }

    // ✅ Directly use uploaded URLs
    const medicalLicenseUrl =
      req.files.medicalLicense?.[0]?.path || "";

    const idProofUrl =
      req.files.idProof?.[0]?.path || "";

    const clinicCertificateUrl =
      req.files.clinicCertificate?.[0]?.path || "";

    // ❗ Required validation
    // if (!medicalLicenseUrl || !idProofUrl) {
    //   return res.status(400).json({
    //     message: "Medical License and ID Proof are required",
    //   });
    // }

    //  Save
    user.documents = {
      medicalLicense: medicalLicenseUrl,
      idProof: idProofUrl,
      clinicCertificate: clinicCertificateUrl,
    };

    user.rejections = user.rejections.filter(r => r.step !== 5);

    user.registrationStep = 5;
    user.status = "pending";

    await user.save();

    res.json({
      success: true,
      message: "Registration submitted for review",
    });
  } catch (err) {
    console.error("Error in registerStep5:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;

    // validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const isEnvAdminLogin =
      user.role === "admin" &&
      adminEmail &&
      adminPassword &&
      normalizedEmail === adminEmail &&
      password === adminPassword;

    let isMatch = false;
    if (isEnvAdminLogin) {
      isMatch = true;
    } else {
      if (!user.password) {
        return res.status(400).json({
          message: "Password login is not configured for this account",
        });
      }

      // check password
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    // 🔥 IMPORTANT: Check approval for doctors
    if (user.role !== "admin" && user.status !== "approved") {
      return res.status(403).json({
        message: "Your account is under review",
      });
    }

    // token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // remove sensitive data
    const userData = user.toObject();
    delete userData.password;

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
          success: true,
          user,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};