import express from "express";
import {
    getPendingUsers,
    approveUser,
    rejectUser,
    getAllUsers,
    toggleDoctorActiveStatus,
    deleteDoctor,
    deleteDoctors,
    setAppVersion,
    getAppVersions,
    updateAppVersion,
    getAllReports,
    updateReportStatus,
    getAllAppointments,
    setLegalContent,
    getLegalContent,
    getAllPatientReports,
    updatePatientReportStatus,
    getPaymentsSummary,
    grantTokens,
    getDoctorTokenPlan,
    createPlan,
    getPlans,
    updatePlan,
    deletePlan,
    assignPlanToDoctor,
    getAllAssignedPlans,
    adminAddWalletBalance,
} from "../controllers/adminController.js";

import { protect } from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";


const router = express.Router();



//admin routes protected
router.use(protect, isAdmin);

//get pending users
router.get("/pending-users", getPendingUsers);

//all users
router.get("/all-users", getAllUsers);

//approve user
router.post("/approve/:id", approveUser);

//reject user
router.post("/reject/:id", rejectUser);

router.patch("/toggle-status/:id", toggleDoctorActiveStatus);

// delete single doctor
router.delete("/delete-doctor/:id", deleteDoctor);
 
// delete multiple doctors
router.delete("/delete-doctors", deleteDoctors);

// app version management
router.post("/app-version", setAppVersion);
router.get("/app-version", getAppVersions);
router.patch("/app-version/:appType/:platform", updateAppVersion);

// appointments
router.get("/appointments", getAllAppointments);
router.get("/payments/summary", getPaymentsSummary);

// legal content (admin protected)
router.patch("/legal/:type", setLegalContent);
router.get("/legal/:type", getLegalContent);

// doctor reports / tickets
router.get("/reports", getAllReports);
router.patch("/reports/:ticketId/status", updateReportStatus);

// patient reports / tickets
router.get("/patient-reports", getAllPatientReports);
router.patch("/patient-reports/:ticketId/status", updatePatientReportStatus);

// token management (free grant — legacy)
router.post("/doctors/:id/grant-tokens", grantTokens);
router.get("/doctors/:id/token-plan", getDoctorTokenPlan);

// plan management
router.post("/plans", createPlan);
router.get("/plans", getPlans);
router.patch("/plans/:id", updatePlan);
router.delete("/plans/:id", deletePlan);

// assign plan to doctor
router.post("/doctors/:id/assign-plan", assignPlanToDoctor);
router.get("/plans/assigned", getAllAssignedPlans);
router.post("/doctors/:id/wallet/add", adminAddWalletBalance);

export default router;
