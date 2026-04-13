import express from "express";
import { sendOtp, verifyOtp } from "../controllers/patient.controller.js";

const router = express.Router();

// send otp
router.post("/send-otp", sendOtp);

// verify otp
router.post("/verify-otp", verifyOtp);

export default router;
