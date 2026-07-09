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
    getDoctorByPhone,
    getDoctorByIdFormatted,
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
    submitDoctorReview,
    getDoctorReviews,
    getClinicById,
    getAllClinics,
    getNotifications,
    getUnreadCount,
    getAppointmentStats,
    getVisitTimeEstimate,
    getMySessions,
    checkFreeFollowup,
    checkFreeFollowupGuest,
    checkClinicGuard,
} from "../controllers/patient.controller.js";

import { getLegalContent } from "../controllers/adminController.js";
import patientAuth from "../middleware/patientAuth.js";
import patientAuthOptional from "../middleware/patientAuthOptional.js";
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

router.get("/doctors/by-phone/:phone", getDoctorByPhone);
router.get("/doctors/:id", getDoctorById);

router.get("/doctorsbyid/:id", getDoctorByIdFormatted);

router.post("/book-appointment", patientAuthOptional, bookAppointment);

router.get("/appointment/:id", patientAuthOptional, getAppointmentDetails);

router.get("/my-appointments", patientAuth, getMyAppointments);

router.get("/appointment-stats", patientAuth, getAppointmentStats);

router.patch("/cancel-appointment/:id", patientAuth, cancelAppointment);

router.get("/queue-status/:id", patientAuth, getQueueStatus);

router.patch("/save-fcm-token", patientAuth, saveFcmToken);

router.get("/doctor-slots/:doctorId", getDoctorSlots);

router.get("/appointment-preview/:doctorId", getAppointmentPreview);

router.post("/report", patientAuth, submitReport);
router.get("/reports", patientAuth, getMyReports);
router.patch("/notifications-toggle", patientAuth, toggleNotifications);
router.delete("/account", patientAuth, deletePatientAccount);

router.post("/doctors/:id/review", patientAuth, submitDoctorReview);
router.get("/doctors/:id/reviews", getDoctorReviews);
router.get("/doctors/:id/free-followup", patientAuth, checkFreeFollowup);
router.get("/doctors/:id/free-followup-guest", checkFreeFollowupGuest);

router.get("/clinics", getAllClinics);
router.get("/clinic/:clinicId", getClinicById);
router.get("/visit-time", getVisitTimeEstimate);
router.get("/my-sessions", patientAuth, getMySessions);
router.get("/clinic-guard", patientAuth, checkClinicGuard);

router.get("/notifications", patientAuth, getNotifications);
router.get("/notifications/unread-count", patientAuth, getUnreadCount);

// Public legal routes (no auth required)
router.get("/legal/privacy_policy_patient", (req, res, next) => {
  req.params.type = "privacy_policy_patient";
  next();
}, getLegalContent);
router.get("/legal/terms_patient", (req, res, next) => {
  req.params.type = "terms_patient";
  next();
}, getLegalContent);

export default router; // ✅ IMPORTANT