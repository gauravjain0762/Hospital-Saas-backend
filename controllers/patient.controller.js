import jwt from "jsonwebtoken";
import Patient from "../models/patient.model.js";

//OTP
const OTP = "123456"; // For testing purposes, use a fixed OTP

const otpStore = {};

// send otp 
export const sendOtp = async (req, res) => {
    try {
        const { mobile } = req.body;


        if (!/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({
                success: false,
                message: "Enter valid 10digit mobile number",
            });
        }

        otpStore[mobile] = OTP;

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully",
            otp: OTP, // In production, do not send OTP in response
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

// verify otp
export const verifyOtp = async (req, res) => {
    try {
        const { mobile, otp } = req.body;

        if (!/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({
                success: false,
                message: "Enter valid mobile number",
            });
        }

        if (!otpStore[mobile]) {
            return res.status(400).json({
                success: false,
                message: "OTP not request for this mobile number",
            });
        }

        if (otpStore[mobile] !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        delete otpStore[mobile];

        // ✅ FIX HERE
        let patient = await Patient.findOne({ mobile });

        if (!patient) {
            patient = await Patient.create({ mobile });
        }

        // generate token
        const token = jwt.sign(
            { id: patient._id, role: "patient" },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            token,
            patient,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};