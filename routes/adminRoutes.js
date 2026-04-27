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

// legal content (admin protected)
router.patch("/legal/:type", setLegalContent);
router.get("/legal/:type", getLegalContent);

// reports / tickets
router.get("/reports", getAllReports);
router.patch("/reports/:ticketId/status", updateReportStatus);

export default router;
