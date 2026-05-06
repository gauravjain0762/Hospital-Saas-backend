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
    getEmployees,
    addEmployee,
    verifyEmployeeOtp,
    removeEmployee,
    getCompletedAppointments,
    exportReport,
    createWalkInAppointment,
    getDoctorSettings,
    updateAvailability,
    updateServices,
    deleteDoctorAccount,
    getStep3,
    updateStep3,
    getTokenPlan,
 } from "../controllers/doctor.controller.js";

router.get("/profile", protect, getDoctorProfile);
router.get("/slots", protect, getDoctorSlots);
router.get("/today-queue", protect, getTodayQueue);
router.patch("/mark-done/:id", protect, markDone);
router.patch("/mark-paid/:id", protect, markPaid);
router.get("/dashboard", protect, getDoctorDashboard);
router.patch("/duty-status", protect, toggleDutyStatus);
router.patch("/save-fcm-token", protect, saveFcmToken);
router.get("/employees", protect, getEmployees);
router.post("/employees", protect, addEmployee);
router.post("/employees/verify", protect, verifyEmployeeOtp);
router.delete("/employees/:phone", protect, removeEmployee);
router.get("/completed-appointments", protect, getCompletedAppointments);
router.get("/export-report", exportReport);
router.post("/create-appointment", protect, createWalkInAppointment);
router.get("/settings", protect, getDoctorSettings);
router.get("/step3", protect, getStep3);
router.patch("/step3", protect, updateStep3);
router.patch("/settings/availability", protect, updateAvailability);
router.patch("/settings/services", protect, updateServices);
router.post("/reports", protect, submitReport);
router.delete("/account", protect, deleteDoctorAccount);
router.get("/reports", protect, getMyReports);
router.get("/token-plan", protect, getTokenPlan);


export default router;