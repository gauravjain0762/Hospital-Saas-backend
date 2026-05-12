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
    updateMaxPatientsPerSlot,
    updateServices,
    deleteDoctorAccount,
    getStep3,
    updateStep3,
    getTokenPlan,
    getMyReviewsAsDoctor,
    getAvailablePlans,
    buyPlan,
    getWallet,
    rechargeWallet,
    getWalletHistory,
    toggleAutoRenew,
    getMyClinic,
    addDoctorToClinic,
    removeDoctorFromClinic,
    getAppointmentStats,
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
router.patch("/settings/max-patients", protect, updateMaxPatientsPerSlot);
router.patch("/settings/services", protect, updateServices);
router.post("/reports", protect, submitReport);
router.delete("/account", protect, deleteDoctorAccount);
router.get("/reports", protect, getMyReports);
router.get("/token-plan", protect, getTokenPlan)
router.patch("/token-plan/auto-renew", protect, toggleAutoRenew);
router.get("/my-reviews", protect, getMyReviewsAsDoctor);
router.get("/plans", protect, getAvailablePlans);
router.post("/plans/buy", protect, buyPlan);
router.get("/wallet", protect, getWallet);
router.post("/wallet/recharge", protect, rechargeWallet);
router.get("/wallet/history", protect, getWalletHistory);

router.get("/clinic", protect, getMyClinic);
router.post("/clinic/add-doctor", protect, addDoctorToClinic);
router.delete("/clinic/remove-doctor/:doctorId", protect, removeDoctorFromClinic);

router.get("/appointment-stats", protect, getAppointmentStats);

export default router;