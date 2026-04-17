import express from "express";
const router = express.Router();

import { 
    sendOtp,
    verifyOtp, 
    createProfile,
    getMyProfile,
    updateProfile,
    getCategories,
    getDoctors,
    getDoctorById,
    bookAppointment,
    getMyAppointments,
    cancelAppointment
} from "../controllers/patient.controller.js";

import patientAuth from "../middleware/patientAuth.js";
import upload from "../utils/multer.js";

// send otp
router.post("/send-otp", sendOtp);

// verify otp
router.post("/verify-otp", verifyOtp);

router.post("/profile", patientAuth, upload.single("profilePhoto"), createProfile);

router.get("/me", patientAuth, getMyProfile);

router.patch("/profile", patientAuth, upload.single("profilePhoto"), updateProfile);

router.get("/categories", getCategories);

router.get("/doctors", getDoctors);

router.get("/doctors/:id", getDoctorById);

router.post("/book-appointment", patientAuth, bookAppointment);

router.get("/my-appointments", patientAuth, getMyAppointments);

router.patch("/cancel-appointment/:id", patientAuth, cancelAppointment);



export default router; // ✅ IMPORTANT