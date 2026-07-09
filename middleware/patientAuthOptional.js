import jwt from "jsonwebtoken";
import Patient from "../models/patient.model.js";

// Like patientAuth, but does not reject the request when no/invalid token is
// present — used on routes shared between the logged-in mobile app (token)
// and the no-signup web guest flow (no token). Sets req.patient when a valid
// token is provided, otherwise leaves it undefined.
const patientAuthOptional = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const patient = await Patient.findById(decoded.id).select("tokenVersion");

    if (!patient || decoded.tokenVersion !== patient.tokenVersion) {
      return next();
    }

    req.patient = decoded;

    next();
  } catch (error) {
    next();
  }
};

export default patientAuthOptional;
