import express from "express";
import {
    getPendingUsers,
    approveUser,
    rejectUser,
    getAllUsers,
    toggleDoctorActiveStatus,
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



export default router;
