const express = require('express');
const router = express.Router();

const { sendOtp, verifyOtp } = require('../controllers/patient.controller');

// send otp
router.post('/send-otp', sendOtp);

// verify otp
router.post('/verify-otp', verifyOtp);

module.exports = router;