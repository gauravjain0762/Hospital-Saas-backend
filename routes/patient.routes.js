import express from "express";
const router = express.Router();

import { sendOtp, verifyOtp } from "../controllers/patient.controller.js";

// send otp
router.post("/send-otp", sendOtp);

// verify otp
router.post("/verify-otp", verifyOtp);

export default router; // ✅ IMPORTANT