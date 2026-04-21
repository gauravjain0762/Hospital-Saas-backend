import express from "express";
const router = express.Router();

import { protect } from "../middleware/authMiddleware.js";
import { getTodayQueue,
    nextToken
 } from "../controllers/doctor.controller.js";

router.get("/today-queue", protect, getTodayQueue);
router.patch("/next-token", protect, nextToken);

export default router;