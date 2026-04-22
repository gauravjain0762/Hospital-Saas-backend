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

    const {
      doctorId,
      date,
      slot,
      fullName,
      email,
      phone,
      problem,
      paymentMethod,
    } = req.body;

    if (!doctorId || !date || !slot || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
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

    // Validate slot against doctor availability
    const selectedDay = new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
    });

    const dayAvailability = doctor.availability.find(
      (d) => d.day === selectedDay && d.isActive
    );

    if (!dayAvailability) {
      return res.status(400).json({
        success: false,
        message: "Doctor unavailable on selected date",
      });
    }

    const validSlot = dayAvailability.slots.find(
      (s) => `${s.startTime} - ${s.endTime}` === slot
    );

    if (!validSlot) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot selected",
      });
    }

    // One booking per day
    const existing = await Appointment.findOne({
      doctorId,
      patientId,
      date,
      status: { $ne: "cancelled" },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Already booked for this date",
      });
    }

    let queue = await Queue.findOne({ doctorId, date });

    if (!queue) {
      queue = await Queue.create({
        doctorId,
        date,
        currentToken: 0,
        lastIssuedToken: 0,
      });
    }

    const tokenNumber = queue.lastIssuedToken + 1;
    queue.lastIssuedToken = tokenNumber;
    await queue.save();

    let consultationFee = doctor.clinic?.consultationFee || 0;
    let isFollowup = false;

    let paymentStatus =
      paymentMethod === "online" ? "pending" : "cash_pending";

    const appointment = await Appointment.create({
      doctorId,
      patientId,
      date,
      slot,
      tokenNumber,
      fullName,
      email,
      phone,
      problem,
      paymentMethod,
      paymentStatus,
      consultationFee,
      isFollowup,
      status: "waiting",
    });

    const patientsAhead = tokenNumber - queue.currentToken;
    const mins = patientsAhead * 10;

    const eta = new Date();
    eta.setMinutes(eta.getMinutes() + mins);

    const expectedTime = eta.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      tokenNumber,
      waitList: tokenNumber,
      expectedTime,
      consultationFee,
      paymentStatus,
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
    const { status } = req.query;

    const query = { patientId };

    if (status) {
      query.status = status;
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: "doctorId",
        select: "name profilePhoto services clinic experience",
      })
      .sort({ createdAt: -1 });

    const result = [];

    for (const item of appointments) {
      const queue = await Queue.findOne({
        doctorId: item.doctorId?._id,
        date: item.date,
      });

      const currentToken = queue?.currentToken || 0;

      result.push({
        id: item._id,
        status: item.status,
        tokenNumber: item.tokenNumber,
        currentToken,

        date: item.date,
        time: item.time,

        doctor: {
          name: item.doctorId?.name || "",
          profilePhoto: item.doctorId?.profilePhoto || "",

          // ✅ existing field
          specialization:
            item.doctorId?.services?.[0] || "General",

          // ✅ NEW ADDED FIELD
          services:
            item.doctorId?.services || [],

          // ✅ OPTIONAL (already selected in populate)
          experience:
            item.doctorId?.experience || 0,
        },

        clinic: {
          clinicName:
            item.doctorId?.clinic?.clinicName || "",
          city:
            item.doctorId?.clinic?.city || "",
          googleBusinessLink:
            item.doctorId?.clinic?.googleBusinessLink || "",
        },
      });
    }

    const upcomingCount = result.filter(
      (x) =>
        x.status === "waiting" ||
        x.status === "in_progress"
    ).length;

    const completedCount = result.filter(
      (x) => x.status === "completed"
    ).length;

    res.status(200).json({
      success: true,
      upcomingCount,
      completedCount,
      appointments: result,
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

export const getQueueStatus = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const appointmentId = req.params.id;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId,
    }).populate({
      path: "doctorId",
      select: "name clinic",
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const queue = await Queue.findOne({
      doctorId: appointment.doctorId._id,
      date: appointment.date,
    });

    const currentToken = queue?.currentToken || 0;

    let patientsAhead = appointment.tokenNumber - currentToken;

    if (patientsAhead < 0) patientsAhead = 0;

    res.status(200).json({
      success: true,
      yourToken: appointment.tokenNumber,
      currentToken,
      patientsAhead,
      status: appointment.status,
      date: appointment.date,
      doctor: {
        name: appointment.doctorId.name,
        clinicName: appointment.doctorId.clinic?.clinicName || "",
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const saveFcmToken = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { fcmToken } = req.body;

    await Patient.findIdAndUpdate(patientId, {
      fcmToken,
    });

    res.status(200).json({
      success: true,
      message: "FCM token saved",
    });
  
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAppointmentDetails = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const appointmentId = req.params.id;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId,
    }).populate({
      path: "doctorId",
      select: "name clinic profilePhoto",
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const doctor = appointment.doctorId;

    const displayId =
      "APT" + String(appointment._id).slice(-4).toUpperCase();

    res.status(200).json({
      success: true,
      appointment: {
        id: appointment._id,
        displayId,
        tokenNumber: appointment.tokenNumber,
        date: appointment.date,
        time: appointment.visitTime || appointment.slot,
        slot: appointment.slot,
        status: appointment.status,

        doctor: {
          name: doctor?.name || "",
          profilePhoto: doctor?.profilePhoto || "",
        },

        clinic: {
          clinicName: doctor?.clinic?.clinicName || "",
          address: doctor?.clinic?.address || "",
          city: doctor?.clinic?.city || "",
          rating: doctor?.clinic?.rating ?? 0,
          latitude: doctor?.clinic?.latitude ?? null,
          longitude: doctor?.clinic?.longitude ?? null,
          googleBusinessLink:
            doctor?.clinic?.googleBusinessLink || "",
        },

        reminderMessage:
          "Please arrive 10 minutes before your appointment time",
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDoctorSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;

    const doctor = await User.findById(doctorId);

    if (!doctor || doctor.role !== "doctor") {
      return res.status(404).json({
        success: false,
        message: "Doctor not found"
      });
    }

    const next7Days = [];
    const today = new Date();

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday"
    ];

    for (let i = 0; i < 7; i++) {
      const current = new Date();
      current.setDate(today.getDate() + i);

      const dayName = dayNames[current.getDay()];

      const doctorDay = doctor.availability.find(
        (item) => item.day === dayName && item.isActive
      );

      if (doctorDay) {
        next7Days.push({
          date: current.toISOString().split("T")[0],
          day: dayName,
          availableSlots: doctorDay.slots.map(
            (slot) => `${slot.startTime} - ${slot.endTime}`
          )
        });
      }
    }

    res.json({
      success: true,
      doctorName: doctor.name,
      slots: next7Days
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
