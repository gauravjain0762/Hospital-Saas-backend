import express from "express";
const router = express.Router();

import { protect } from "../middleware/authMiddleware.js";
import { getTodayQueue,
    markDone,
    markPaid,
    getDoctorDashboard,
    getDoctorProfile,
    getDoctorSlots,
    submitReport,
    getMyReports,
    toggleDutyStatus,
    saveFcmToken,
    setSecondaryPhone,
    getCompletedAppointments,
    exportReport,
    createWalkInAppointment,
    getDoctorSettings,
    updateAvailability,
    updateServices,
 } from "../controllers/doctor.controller.js";

router.get("/profile", protect, getDoctorProfile);
router.get("/slots", protect, getDoctorSlots);
router.get("/today-queue", protect, getTodayQueue);
router.patch("/mark-done/:id", protect, markDone);
router.patch("/mark-paid/:id", protect, markPaid);
router.get("/dashboard", protect, getDoctorDashboard);
router.patch("/duty-status", protect, toggleDutyStatus);
router.patch("/save-fcm-token", protect, saveFcmToken);
router.patch("/secondary-phone", protect, setSecondaryPhone);
router.get("/completed-appointments", protect, getCompletedAppointments);
router.get("/export-report", exportReport);
router.post("/create-appointment", protect, createWalkInAppointment);
router.get("/settings", protect, getDoctorSettings);
router.patch("/settings/availability", protect, updateAvailability);
router.patch("/settings/services", protect, updateServices);
router.post("/reports", protect, submitReport);
router.get("/reports", protect, getMyReports);


export default router;