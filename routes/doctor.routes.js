import express from "express";
const router = express.Router();

import { protect } from "../middleware/authMiddleware.js";
import { getTodayQueue } from "../controllers/doctor.controller.js";

router.get("/today-queue", protect, getTodayQueue);

export default router;