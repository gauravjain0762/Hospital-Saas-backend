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
  registerStep4,
  registerStep5,
  loginUser,
} from "../controllers/authController.js";

const router = express.Router();


router.post("/doctor-send-otp", sendOtp);
router.post("/doctor-verify-otp", verifyOtp);
router.post("/doctor-login", loginUser);
router.post("/admin-login", loginUser);

router.post("/doctor-register-step1", registerStep1);
router.post("/doctor-register-step2", protect, upload.array("clinicPhotos", 7), registerStep2);
router.post("/doctor-register-step3", protect, registerStep3);
router.post("/doctor-register-step4", protect, registerStep4);
router.post("/doctor-register-step5", protect, upload.fields([
  { name: "medicalLicense", maxCount: 1 },
  { name: "idProof", maxCount: 1 },
  { name: "clinicCertificate", maxCount: 1 },
]), registerStep5
);

router.get("/doctor-services", getServices);

export default router;
