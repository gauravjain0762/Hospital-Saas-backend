import User from "../models/User.js";
import { generateOtp } from "../utils/generateOtp.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";
import Service from "../models/Service.js";
import Qualification from "../models/Qualification.js";



// SEND OTP
export const sendOtp = async (req, res) => {
  console.log("HIT /doctor-send-otp", req.body);
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    // Duplicate phone check
    const existingUser = await User.findOne({ 
      phone, 
      otpVerified: true,
      _id: { $ne: req.body._id || null }
    });

    if (existingUser) {
      const hasRejections = existingUser.rejections && existingUser.rejections.length > 0;

      
      //  Account in review — save OTP cost, don't send
if (existingUser.status === "pending" && !hasRejections && existingUser.registrationStep >= 5) {
  return res.status(200).json({
    success: false,
    accountStatus: "in_review",
    message: "Your account is currently under review. We will notify you once approved.",
  });
}

      // ✅ Account approved — block registration
      if (existingUser.status === "approved") {
        const fixedOtp = process.env.FIXED_OTP?.trim();
        const otp = fixedOtp || generateOtp();

        await User.findOneAndUpdate(
          { phone },
          {
            $set: {
              otp,
               otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
            },
          }
        );

        console.log("Doctor Login OTP:", otp);

        return res.status(400).json({
          success: true,
          mode: "login",
          accountStatus: "approved",
          message: "OTP sent for login",
        });
      }

      // ✅ Rejected with rejections — fall through, allow OTP
    }

    // check if this is a secondary (receptionist) phone
    const doctorWithSecondary = await User.findOne({ secondaryPhone: phone });
    if (doctorWithSecondary) {
      const fixedOtp = process.env.FIXED_OTP?.trim();
      const otp = fixedOtp || generateOtp();
      doctorWithSecondary.secondaryOtp = otp;
      doctorWithSecondary.secondaryOtpExpiry = new Date(Date.now() + 5 * 60 * 1000);
      await doctorWithSecondary.save();
      console.log("Secondary OTP:", otp);
      return res.json({ success: true, message: "OTP sent successfully", mode: "secondary" });
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

    console.log("OTP:", otp); //  for testing

    res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("SEND OTP ERROR:", err); 
    res.status(500).json({ message: err.message });
  }
};


//  VERIFY OTP
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (otp === undefined || otp === null || String(otp).trim() === "") {
      return res.status(400).json({ message: "Please enter otp" });
    }

    // check if secondary phone login
    const doctorWithSecondary = await User.findOne({ secondaryPhone: phone });
    if (doctorWithSecondary) {
      if (
        String(doctorWithSecondary.secondaryOtp) !== String(otp) ||
        doctorWithSecondary.secondaryOtpExpiry < new Date()
      ) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      doctorWithSecondary.secondaryOtp = null;
      await doctorWithSecondary.save();

      const token = jwt.sign(
        { id: doctorWithSecondary._id, isSecondary: true },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        message: "OTP verified",
        token,
        isSecondary: true,
        user: {
          id: doctorWithSecondary._id,
          name: doctorWithSecondary.name,
          phone: doctorWithSecondary.phone,
          secondaryPhone: doctorWithSecondary.secondaryPhone,
          profilePhoto: doctorWithSecondary.profilePhoto,
          status: doctorWithSecondary.status,
          activeStatus: doctorWithSecondary.activeStatus,
          registrationStep: doctorWithSecondary.registrationStep,
        },
      });
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
        name: user.name,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
        status: user.status,
        activeStatus: user.activeStatus,
        registrationStep: user.registrationStep,
        rejectedSteps: user.rejections?.map(r => r.step) || [],
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// step1 
export const registerStep1 = async (req, res) => {
  try {
    const { name, email, phone, experience, gender } = req.body;

    const user = await User.findOne({ phone });

    if (!user || !user.otpVerified) {
      return res.status(400).json({
        message: "Please verify OTP first",
      });
    }

     //  Check duplicate email (other users only)
    const existingEmail = await User.findOne({
      email,
      _id: { $ne: user._id }
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    //  Handle profile photo upload
    let profilePhotoUrl = user.profilePhoto || ""; // keep existing if not uploaded
    if (req.file) {
      // multer single()
      profilePhotoUrl = req.file.path;
    } else if (req.files?.profilePhoto?.[0]) {
      // multer fields()
      profilePhotoUrl = req.files.profilePhoto[0].path;
    }

    if (!["male", "female"].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Gender must be male or female",
      });
    }

    user.name = name;
    user.email = email;
    user.experience = experience;
    user.gender = gender;
    user.profilePhoto = profilePhotoUrl;
    user.registrationStep = 1;

    user.rejections = user.rejections.filter(r => r.step !== 1);

    await user.save();

    res.json({
      success: true,
      message: "Step 1 completed",
      user,
    });
  } catch (err) {
     if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }
       res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// STEP 2 REGISTER
export const registerStep2 = async (req, res) => {
  try {
    const {
      newClinic,
      googleBusinessLink,
      clinicName,
      about,
      address,
      city,
      state,
      pincode,
      consultationFee,
      freeFollowupDays,
      rating,
      latitude,
      longitude,
      qualifications,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.registrationStep < 1) {
      return res.status(400).json({
        message: "Complete step 1 first",
      });
    }

    let photoUrls = [];

    if (req.files) {
      if (Array.isArray(req.files)) {
        photoUrls = req.files.map(file => file.path);
      } else if (req.files.clinicPhotos) {
        photoUrls = req.files.clinicPhotos.map(file => file.path);
      }
    }

 if (
  latitude === undefined ||
  longitude === undefined ||
  latitude === "" ||
  longitude === ""
) {
  return res.status(400).json({
    success: false,
    message: "Latitude and Longitude are required"
  });
}

    if (!qualifications || qualifications.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one qualification is required",
      });
    }

    for (let qualName of qualifications) {
      await Qualification.findOneAndUpdate(
        { name: qualName },
        { name: qualName },
        { upsert: true, new: true }
      );
    }

    user.clinic = {
  newClinic: newClinic === true || newClinic === "true",
  googleBusinessLink,
  clinicName,
  about,
  address,
  city,
  state,
  pincode,

  consultationFee: Number(consultationFee),
  freeFollowupDays: Number(freeFollowupDays) || 0,

  rating: Number(rating) || 0,

  latitude: latitude ? Number(latitude) : null,
  longitude: longitude ? Number(longitude) : null,

  photos: photoUrls,
};

    user.qualifications = qualifications;
    user.rejections = user.rejections.filter(r => r.step !== 2);
    user.registrationStep = 2;

    await user.save();

    res.json({
      success: true,
      message: "Step 2 completed",
      clinic: user.clinic,
      qualifications: user.qualifications,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const registerStep3 = async (req, res) => {
  try {
    const { services, availability, maxPatientsPerSlot } = req.body;

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

    if (!maxPatientsPerSlot || Number(maxPatientsPerSlot) < 1) {
      return res.status(400).json({
        success: false,
        message: "Max patients per slot is required and must be at least 1",
      });
    }

    user.services = services;
    user.availability = availability;
    user.maxPatientsPerSlot = Number(maxPatientsPerSlot);
    user.registrationStep = 3;

    user.rejections = user.rejections.filter(r => r.step !== 3);

    await user.save();

    res.json({
      success: true,
      message: "Step 3 completed",
      data: {
        services: user.services,
        availability: user.availability,
        maxPatientsPerSlot: user.maxPatientsPerSlot,
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

export const getQualifications = async (req, res) => {
  try {
    const qualifications = await Qualification.find().sort({ name: 1 });

    res.json({
      success: true,
      qualifications,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const registerStep4 = async (req, res) => {
  try {
    const { upiId } = req.body;

    const user = await User.findById(req.user._id);

    if (!user || user.registrationStep < 3) {
      return res.status(400).json({
        message: "Complete step 3 first",
      });
    }

    if (!upiId) {
      return res.status(400).json({
        message: "UPI ID is required",
      });
    }

    const upiRegex = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upiId)) {
      return res.status(400).json({
        message: "Invalid UPI ID format",
      });
    }

    const qrCodeUrl = req.file?.path || req.files?.qrCode?.[0]?.path || "";

    user.paymentDetails = {
      upiId,
      qrCode: qrCodeUrl,
    };

    user.rejections = user.rejections.filter(r => r.step !== 4);
    user.registrationStep = 4;

    await user.save();

    res.json({
      success: true,
      message: "Step 4 completed",
      paymentDetails: user.paymentDetails,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const registerStep5 = async (req, res) => {
  try {
    console.log("FILES:", req.files);

    const user = await User.findById(req.user._id);

    // ✅ Allow if step 4 done OR if rejected specifically at step 5
    const isRejectedAtStep5 = user.rejections?.some(r => r.step === 5);

    if (!user || (user.registrationStep < 4 && !isRejectedAtStep5)) {
      return res.status(400).json({
        message: "Complete step 4 first",
      });
    }

    const aadharFrontUrl = req.files?.aadharFront?.[0]?.path || "";
    const aadharBackUrl = req.files?.aadharBack?.[0]?.path || "";
    const panCardUrl = req.files?.panCard?.[0]?.path || "";

    if (!aadharFrontUrl || !aadharBackUrl) {
      return res.status(400).json({
        success: false,
        message: "Aadhar card front and back are required",
      });
    }

    user.documents = {
      aadharFront: aadharFrontUrl,
      aadharBack: aadharBackUrl,
      panCard: panCardUrl,
    };

    const { awards, achievements } = req.body;

    if (awards !== undefined) user.awards = awards;
    if (achievements !== undefined) user.achievements = achievements;

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