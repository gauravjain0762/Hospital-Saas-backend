import express from "express";
import upload from "../utils/multer.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  sendOtp,
  verifyOtp,
  registerStep1,
  registerStep2,
  registerStep3,
  getServices,
  getQualifications,
  registerStep4,
  registerStep5,
  loginUser,
  getMe,
} from "../controllers/authController.js";

const router = express.Router();


router.post("/doctor-send-otp", sendOtp);
router.post("/doctor-verify-otp", verifyOtp);
router.post("/doctor-login", loginUser);
router.post("/admin-login", loginUser);
router.get("/doctor-me", protect, getMe);

router.post("/doctor-register-step1", upload.single("profilePhoto"), registerStep1);
router.post("/doctor-register-step2", protect, upload.array("clinicPhotos", 7), registerStep2);
router.post("/doctor-register-step3", protect, registerStep3);
router.post("/doctor-register-step4", protect, upload.single("qrCode"), registerStep4);
router.post("/doctor-register-step5", protect, upload.fields([
  { name: "aadharFront", maxCount: 1 },
  { name: "aadharBack", maxCount: 1 },
  { name: "panCard", maxCount: 1 },
]), registerStep5);

router.get("/doctor-services", getServices);
router.get("/doctor-qualifications", getQualifications);

export default router;
