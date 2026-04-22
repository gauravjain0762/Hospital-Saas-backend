import express from "express";
const router = express.Router();

import { protect } from "../middleware/authMiddleware.js";
import { getTodayQueue,
    markDone,
 } from "../controllers/doctor.controller.js";

router.get("/today-queue", protect, getTodayQueue);
router.patch("/mark-done/:id", protect, markDone);

export default router;