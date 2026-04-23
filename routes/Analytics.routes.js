import express from "express";
const router = express.Router();

import { isAdmin } from "../middleware/adminMiddleware.js";
import { getDoctorAnalytics } from "../controllers/Analytics.controller.js";

// GET /api/admin/analytics/doctor/:doctorId?filter=today
// GET /api/admin/analytics/doctor/:doctorId?filter=yesterday
// GET /api/admin/analytics/doctor/:doctorId?filter=7days
// GET /api/admin/analytics/doctor/:doctorId?filter=custom&customStart=2025-04-01&customEnd=2025-04-23
router.get("/doctor/:doctorId", isAdmin, getDoctorAnalytics);

export default router;
