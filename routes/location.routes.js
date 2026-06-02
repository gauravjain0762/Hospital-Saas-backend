import express from "express";
import State from "../models/State.js";
import City from "../models/City.js";

const router = express.Router();

// GET /api/states
router.get("/states", async (req, res) => {
  try {
    const states = await State.find({}, "_id name").sort({ name: 1 }).lean();
    res.json({ success: true, data: states });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/cities?stateId=<mongoId>
router.get("/cities", async (req, res) => {
  try {
    const { stateId } = req.query;
    if (!stateId) {
      return res.status(400).json({ success: false, message: "stateId is required" });
    }
    const cities = await City.find({ state: stateId }, "_id name state").sort({ name: 1 }).lean();
    if (!cities.length) {
      return res.status(404).json({ success: false, message: "No cities found for this state" });
    }
    res.json({ success: true, data: cities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
