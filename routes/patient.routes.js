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
    cancelAppointment,
    getQueueStatus,
    saveFcmToken,
    getAppointmentDetails,
    getDoctorSlots,
    getAppointmentPreview,
    submitReport,
    getMyReports,
    deletePatientAccount,
    toggleNotifications,
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

router.get("/appointment/:id", patientAuth, getAppointmentDetails);

router.get("/my-appointments", patientAuth, getMyAppointments);

router.patch("/cancel-appointment/:id", patientAuth, cancelAppointment);

router.get("/queue-status/:id", patientAuth, getQueueStatus);

router.patch("/save-fcm-token", patientAuth, saveFcmToken);

router.get("/doctor-slots/:doctorId", getDoctorSlots);

router.get("/appointment-preview/:doctorId", getAppointmentPreview);

router.post("/report", patientAuth, submitReport);
router.get("/reports", patientAuth, getMyReports);
router.patch("/notifications-toggle", patientAuth, toggleNotifications);
router.delete("/account", patientAuth, deletePatientAccount);

export default router; // ✅ IMPORTANT