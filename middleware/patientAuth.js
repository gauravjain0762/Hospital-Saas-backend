import jwt from "jsonwebtoken";
import Patient from "../models/patient.model.js";

const patientAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const patient = await Patient.findById(decoded.id).select("tokenVersion");

    if (!patient) {
      return res.status(401).json({
        success: false,
        message: "Patient not found",
      });
    }

    if (decoded.tokenVersion !== patient.tokenVersion) {
      return res.status(401).json({
        success: false,
        forceLogout: true,
        message: "Session expired. Please log in again.",
      });
    }

    req.patient = decoded;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

export default patientAuth;
