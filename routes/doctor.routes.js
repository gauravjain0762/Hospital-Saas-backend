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
 } from "../controllers/doctor.controller.js";

router.get("/profile", protect, getDoctorProfile);
router.get("/slots", protect, getDoctorSlots);
router.get("/today-queue", protect, getTodayQueue);
router.patch("/mark-done/:id", protect, markDone);
router.patch("/mark-paid/:id", protect, markPaid);
router.get("/dashboard", protect, getDoctorDashboard);
router.patch("/duty-status", protect, toggleDutyStatus);
router.patch("/save-fcm-token", protect, saveFcmToken);
router.post("/reports", protect, submitReport);
router.get("/reports", protect, getMyReports);


export default router;