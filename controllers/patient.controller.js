import jwt from "jsonwebtoken";
import Patient from "../models/patient.model.js";
import User from "../models/User.js";
import Appointment from "../models/appointment.model.js";
import Queue from "../models/queue.model.js";

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

export const createProfile = async (req, res) => {
  try {
    const patientId = req.patient.id;

    const {
      fullName,
      email,
      address,
      city,
      state,
    } = req.body;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    patient.fullName = fullName;
    patient.email = email;
    patient.address = address;
    patient.city = city;
    patient.state = state;

    // optional image
    if (req.file) {
      patient.profilePhoto = req.file.path;
    }

    await patient.save();

    res.status(200).json({
      success: true,
      message: "Profile created successfully",
      patient,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET logged-in patient profile
export const getMyProfile = async (req, res) => {
  try {
    const patient = await Patient.findById(req.patient.id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    res.status(200).json({
      success: true,
      patient,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// PATCH update patient profile
export const updateProfile = async (req, res) => {
  try {
    const patient = await Patient.findById(req.patient.id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    const {
      fullName,
      email,
      address,
      city,
      state,
    } = req.body;

    // Only update sent fields
    if (fullName) patient.fullName = fullName;
    if (email) patient.email = email;
    if (address) patient.address = address;
    if (city) patient.city = city;
    if (state) patient.state = state;

    // optional image update
    if (req.file) {
      patient.profilePhoto = req.file.path;
    }

    await patient.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      patient,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET unique categories from doctors services
export const getCategories = async (req, res) => {
  try {
    const doctors = await User.find({
      role: "doctor",
      status: "approved",
    }).select("services");

    const allServices = doctors.flatMap(doc => doc.services || []);

    const uniqueServices = [...new Set(allServices)].sort();

    res.status(200).json({
      success: true,
      categories: uniqueServices,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// GET all doctors with optional filters
export const getDoctors = async (req, res) => {
  try {
    const { service, city } = req.query;

    const query = {
      role: "doctor",
      status: "approved",
    };

    if (service) {
      query.services = { $in: [service] };
    }

    if (city) {
      query["clinic.city"] = city;
    }

    const doctors = await User.find(query).select("-password");

    res.status(200).json({
      success: true,
      count: doctors.length,
      doctors,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// GET doctor by ID
export const getDoctorById = async (req, res) => {
  try {
    const doctor = await User.findOne({
      _id: req.params.id,
      role: "doctor",
      status: "approved",
    }).select("-password");

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    res.status(200).json({
      success: true,
      doctor,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const bookAppointment = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { doctorId, date } = req.body;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "doctorId and date required",
      });
    }

    const doctor = await User.findOne({
      _id: doctorId,
      role: "doctor",
      status: "approved",
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const existingAppointment = await Appointment.findOne({
      doctorId,
      patientId,
      date,
      status: { $ne: "cancelled" }
    });

    if (existingAppointment) {
      return res.status(400).json({ 
        success: false,
        message: "You already booked this doctor for this date",
      });
    }

    // Queue for today
    let queue = await Queue.findOne({ doctorId, date });

    if (!queue) {
      queue = await Queue.create({
        doctorId,
        date,
        currentToken: 0,
        lastIssuedToken: 0,
      });
    }

    // max 500 tokens
    if (queue.lastIssuedToken >= 500) {
      return res.status(400).json({
        success: false,
        message: "Today's booking limit reached",
      });
    }

    const tokenNumber = queue.lastIssuedToken + 1;
    queue.lastIssuedToken = tokenNumber;
    await queue.save();

    // Follow-up logic
    let consultationFee = doctor.clinic?.consultationFee || 0;
    let isFollowup = false;

    const freeDays = doctor.freeFollowupDays || 0;

    if (freeDays > 0) {
      const lastCompleted = await Appointment.findOne({
        doctorId,
        patientId,
        status: "completed",
        consultationFee: { $gt: 0 },
      }).sort({ completedAt: -1 });

      if (lastCompleted && lastCompleted.completedAt) {
        const lastDate = new Date(lastCompleted.completedAt);
        const expiry = new Date(lastDate);
        expiry.setDate(expiry.getDate() + freeDays);

        const bookingDate = new Date(date);

        if (bookingDate <= expiry) {
          consultationFee = 0;
          isFollowup = true;
        }
      }
    }

    const appointment = await Appointment.create({
      doctorId,
      patientId,
      date,
      tokenNumber,
      consultationFee,
      isFollowup,
    });

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      tokenNumber,
      consultationFee,
      isFollowup,
      appointment,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const getMyAppointments = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { status, date } = req.query;

    const query = { patientId };

    //filter by status
    if (status) {
      query.status = status;
    }

    //filter by today
    if (date === "today") {
      const today = new Date().toISOString().split("T")[0];
      query.date = today;
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: "doctorId",
        select: "name profilePhoto services clinic experience",
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      appointments,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const appointmentId = req.params.id;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (appointment.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed appointment cannot be cancelled",
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Appointment already cancelled",
      });
    }

    appointment.status = "cancelled";
    await appointment.save();

    res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      appointment,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};