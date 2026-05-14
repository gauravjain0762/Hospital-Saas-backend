import jwt from "jsonwebtoken";
import Patient from "../models/patient.model.js";
import User from "../models/User.js";
import Appointment from "../models/appointment.model.js";
import Queue from "../models/queue.model.js";
import PatientReport from "../models/patientReport.model.js";
import Review from "../models/review.model.js";
import Clinic from "../models/clinic.model.js";
import Notification from "../models/notification.model.js";
import { checkAndDeductToken } from "../utils/tokenGuard.js";

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

        const isProfileComplete = !!patient.fullName;

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            token,
            isProfileComplete,
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
    }).select("-password -employees.otp -employees.otpExpiry");

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


export const getDoctorByIdFormatted = async (req, res) => {
  try {
    const doctor = await User.findOne({
      _id: req.params.id,
      role: "doctor",
      status: "approved",
    }).select("-password -otp -otpExpiry -employees.otp -employees.otpExpiry -documents -bankDetails");

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    res.status(200).json({
      success: true,
      clinic: {
        clinicName: doctor.clinic?.clinicName || "",
        about: doctor.clinic?.about || "",
        address: doctor.clinic?.address || "",
        city: doctor.clinic?.city || "",
        state: doctor.clinic?.state || "",
        pincode: doctor.clinic?.pincode || "",
        country: doctor.clinic?.country || "",
        consultationFee: doctor.clinic?.consultationFee ?? 0,
        freeFollowupDays: doctor.clinic?.freeFollowupDays ?? 0,
        rating: doctor.clinic?.rating ?? 0,
        latitude: doctor.clinic?.latitude ?? null,
        longitude: doctor.clinic?.longitude ?? null,
        photos: doctor.clinic?.photos || [],
        googleBusinessLink: doctor.clinic?.googleBusinessLink || "",
      },
      doctors: [
        {
          id: doctor._id,
          name: doctor.name,
          profilePhoto: doctor.profilePhoto || null,
          experience: doctor.experience,
          gender: doctor.gender,
          rating: doctor.clinic?.rating ?? 0,
          services: doctor.services,
          qualifications: doctor.qualifications,
          awards: doctor.awards,
          achievements: doctor.achievements,
          doctorAvailable: doctor.doctorAvailable,
          activeStatus: doctor.activeStatus,
          availability: doctor.availability,
          maxPatientsPerSlot: doctor.maxPatientsPerSlot ?? null,
          paymentDetails: {
            paymentMethod: doctor.paymentDetails?.paymentMethod,
            upiId: doctor.paymentDetails?.upiId,
          },
        },
      ],
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

    // Enforce max patients per slot
    if (doctor.maxPatientsPerSlot) {
      const slotBookings = await Appointment.countDocuments({
        doctorId,
        date,
        slot,
        status: { $ne: "cancelled" },
      });

      if (slotBookings >= doctor.maxPatientsPerSlot) {
        return res.status(400).json({
          success: false,
          message: "This slot is fully booked. Please choose another slot.",
        });
      }
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

    // deduct token only after all validations pass
    const tokenResult = await checkAndDeductToken(doctorId);
    if (!tokenResult.allowed) {
      return res.status(403).json({ success: false, message: tokenResult.reason });
    }

    if (tokenResult.walletBalance !== undefined) {
      const io = req.app.get("io");
      io.to(`doctor_${doctorId}`).emit("walletUpdated", {
        walletBalance: tokenResult.walletBalance,
        tokensAvailable: tokenResult.tokensAvailable,
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

    const freeFollowupDays = doctor.clinic?.freeFollowupDays || 0;
    if (freeFollowupDays > 0) {
      const lastCompleted = await Appointment.findOne({
        doctorId,
        patientId,
        status: "completed",
      }).sort({ completedAt: -1 });

      if (lastCompleted?.completedAt) {
        const daysSinceLast =
          (Date.now() - new Date(lastCompleted.completedAt)) / (1000 * 60 * 60 * 24);
        if (daysSinceLast <= freeFollowupDays) {
          isFollowup = true;
          consultationFee = 0;
        }
      }
    }

    let paymentStatus = isFollowup
      ? "free_followup"
      : paymentMethod === "online"
      ? "pending"
      : "cash_pending";

    const docPrefix = (doctor.name || "XX").replace(/\s+/g, "").substring(0, 2).toUpperCase();
    const patPrefix = (fullName || "XX").replace(/\s+/g, "").substring(0, 2).toUpperCase();
    const mobPrefix = (phone || "00").substring(0, 2);
    const unique = Math.random().toString(36).substring(2, 4).toUpperCase();
    const appointmentId = `${docPrefix}${patPrefix}${mobPrefix}${unique}`;

    const appointment = await Appointment.create({
      appointmentId,
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

    // emit to doctor's room so dashboard updates in real-time
    const io = req.app.get("io");
    const room = `doctor_${doctorId}`;
    const socketsInRoom = await io.in(room).allSockets();
    console.log(`[SOCKET] dashboardUpdated | room=${room} | socketsInRoom=${socketsInRoom.size} | lastIssuedToken=${queue.lastIssuedToken}`);
    io.to(room).emit("dashboardUpdated", {
      doctorId,
      lastIssuedToken: queue.lastIssuedToken,
    });
    console.log(`[SOCKET] dashboardUpdated emitted | room=${room}`);

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
    const { status } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { patientId };
    if (status) query.status = status;

    const [total, upcomingCount, completedCount, appointments] = await Promise.all([
      Appointment.countDocuments(query),
      Appointment.countDocuments({ patientId, status: { $in: ["waiting", "in_progress"] } }),
      Appointment.countDocuments({ patientId, status: "completed" }),
      Appointment.find(query)
        .populate({ path: "doctorId", select: "name profilePhoto services clinic experience" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

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
        slot: item.slot,
        time: item.time,
        doctor: {
          id: item.doctorId?._id || "",
          name: item.doctorId?.name || "",
          profilePhoto: item.doctorId?.profilePhoto || "",
          specialization: item.doctorId?.services?.[0] || "General",
          services: item.doctorId?.services || [],
          experience: item.doctorId?.experience || 0,
        },
        clinic: {
          clinicName: item.doctorId?.clinic?.clinicName || "",
          city: item.doctorId?.clinic?.city || "",
          googleBusinessLink: item.doctorId?.clinic?.googleBusinessLink || "",
        },
      });
    }

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
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

    await Patient.findByIdAndUpdate(patientId, {
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

export const getAppointmentPreview = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, slot } = req.query;

    if (!date || !slot) {
      return res.status(400).json({
        success: false,
        message: "Date and slot required"
      });
    }

    const doctor = await User.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found"
      });
    }

    // ✅ Current running token = highest DONE token
    const lastDone = await Appointment.findOne({
      doctorId,
      date,
      slot,
      status: "done"
    }).sort({ tokenNumber: -1 });

    const currentToken = lastDone ? lastDone.tokenNumber : 0;

    // ✅ Next token = highest issued token + 1
    const lastBooked = await Appointment.findOne({
      doctorId,
      date,
      slot,
      status: { $ne: "cancelled" }
    }).sort({ tokenNumber: -1 });

    const yourToken = lastBooked
      ? lastBooked.tokenNumber + 1
      : 1;

    // ✅ Wait time
    const waitMinutes = Math.max(
      0,
      (yourToken - currentToken - 1) * 5
    );

    // ✅ Slot start time
    const startTime = slot.split("-")[0].trim();

    const [hour, min] = startTime.split(":");

    const estimate = new Date(`${date}T${hour}:${min}:00`);

    estimate.setMinutes(
      estimate.getMinutes() + waitMinutes
    );

    res.json({
      success: true,
      currentToken,
      yourToken,
      estimatedWaitMinutes: waitMinutes,
      estimatedTime: estimate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      }),
      freeFollowupDays:
        doctor.clinic?.freeFollowupDays || 0
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// POST /api/patient/report
export const submitReport = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { subject, category, priority, description } = req.body;

    if (!subject || !category || !priority) {
      return res.status(400).json({ success: false, message: "subject, category and priority are required" });
    }

    const patient = await Patient.findById(patientId).select("fullName mobile");

    const report = await PatientReport.create({
      patientId,
      patientName: patient?.fullName || "",
      mobile: patient?.mobile || "",
      subject,
      category,
      priority,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      report: {
        ticketId: report.ticketId,
        patientName: report.patientName,
        mobile: report.mobile,
        subject: report.subject,
        category: report.category,
        priority: report.priority,
        status: report.status,
        description: report.description,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/reports
export const getMyReports = async (req, res) => {
  try {
    const patientId = req.patient.id;

    const reports = await PatientReport.find({ patientId })
      .populate("patientId", "fullName mobile")
      .sort({ createdAt: -1 });

    const formatted = reports.map((r) => ({
      ticketId: r.ticketId,
      subject: r.subject,
      category: r.category,
      priority: r.priority,
      status: r.status,
      description: r.description,
      createdAt: r.createdAt,
    }));

    res.status(200).json({ success: true, reports: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/patient/notifications-toggle
export const toggleNotifications = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "enabled must be true or false" });
    }

    const patient = await Patient.findByIdAndUpdate(
      patientId,
      { notificationsEnabled: enabled },
      { new: true }
    ).select("notificationsEnabled");

    res.status(200).json({
      success: true,
      message: `Notifications ${enabled ? "enabled" : "disabled"}`,
      notificationsEnabled: patient.notificationsEnabled,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/patient/account
export const deletePatientAccount = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { reason } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

    await Patient.findByIdAndDelete(patientId);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
      reason: reason || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/patient/doctors/:id/review
export const submitDoctorReview = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const doctorId = req.params.id;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "approved" });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const patient = await Patient.findById(patientId);
    const patientName = patient?.fullName || "Anonymous";

    const existing = await Review.findOne({ doctorId, patientId });
    if (existing) {
      existing.rating = rating;
      existing.review = review || "";
      existing.patientName = patientName;
      await existing.save();
    } else {
      await Review.create({ doctorId, patientId, patientName, rating, review: review || "" });
    }

    // recalculate doctor's average rating
    const allReviews = await Review.find({ doctorId });
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await User.findByIdAndUpdate(doctorId, { "clinic.rating": parseFloat(avg.toFixed(1)) });

    res.status(200).json({ success: true, message: "Review submitted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/doctors/:id/reviews
export const getDoctorReviews = async (req, res) => {
  try {
    const doctorId = req.params.id;

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "approved" });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const reviews = await Review.find({ doctorId }).sort({ createdAt: -1 });

    const totalRatings = reviews.length;
    const averageRating = totalRatings
      ? parseFloat((reviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings).toFixed(1))
      : 0;

    res.status(200).json({
      success: true,
      averageRating,
      totalRatings,
      reviews: reviews.map((r) => ({
        id: r._id,
        patientName: r.patientName,
        rating: r.rating,
        review: r.review,
        date: r.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/notifications
export const getNotifications = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [total, notifications] = await Promise.all([
      Notification.countDocuments({ patientId }),
      Notification.find({ patientId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("title body type isRead createdAt doctorId"),
    ]);

    // mark fetched notifications as read
    const ids = notifications.filter(n => !n.isRead).map(n => n._id);
    if (ids.length) await Notification.updateMany({ _id: { $in: ids } }, { isRead: true });

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      unreadCount: ids.length,
      notifications: notifications.map((n) => ({
        id: n._id,
        title: n.title,
        body: n.body,
        type: n.type,
        isRead: n.isRead,
        doctorId: n.doctorId,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/appointment-stats
export const getAppointmentStats = async (req, res) => {
  try {
    const patientId = req.patient.id;

    const [totalBooked, completedCount, upcomingCount] = await Promise.all([
      Appointment.countDocuments({ patientId }),
      Appointment.countDocuments({ patientId, status: "completed" }),
      Appointment.countDocuments({ patientId, status: { $in: ["waiting", "in_progress"] } }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalBooked,
        completed: completedCount,
        upcoming: upcomingCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/notifications/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ patientId: req.patient.id, isRead: false });
    res.status(200).json({ success: true, unreadCount: count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/clinic/:clinicId  — scanned from QR code, no auth needed
export const getClinicById = async (req, res) => {
  try {
    const { clinicId } = req.params;

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) return res.status(404).json({ success: false, message: "Clinic not found" });

    const doctors = await User.find(
      { clinicId, role: "doctor", status: "approved" },
    ).select("-password -otp -otpExpiry -employees.otp -employees.otpExpiry -documents -bankDetails");

    res.status(200).json({
      success: true,
      clinic: {
        id: clinic._id,
        clinicName: clinic.clinicName,
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
        pincode: clinic.pincode,
        phone: clinic.phone,
        photos: clinic.photos,
      },
      doctors: doctors.map((d) => ({
        id: d._id,
        name: d.name,
        profilePhoto: d.profilePhoto || null,
        experience: d.experience,
        gender: d.gender,
        rating: d.clinic?.rating ?? 0,
        services: d.services,
        qualifications: d.qualifications,
        awards: d.awards,
        achievements: d.achievements,
        doctorAvailable: d.doctorAvailable,
        activeStatus: d.activeStatus,
        availability: d.availability,
        maxPatientsPerSlot: d.maxPatientsPerSlot ?? null,
        clinic: {
          clinicName: d.clinic?.clinicName || "",
          about: d.clinic?.about || "",
          address: d.clinic?.address || "",
          city: d.clinic?.city || "",
          state: d.clinic?.state || "",
          pincode: d.clinic?.pincode || "",
          consultationFee: d.clinic?.consultationFee ?? 0,
          freeFollowupDays: d.clinic?.freeFollowupDays ?? 0,
          rating: d.clinic?.rating ?? 0,
          latitude: d.clinic?.latitude ?? null,
          longitude: d.clinic?.longitude ?? null,
          photos: d.clinic?.photos || [],
          googleBusinessLink: d.clinic?.googleBusinessLink || "",
        },
        paymentDetails: {
          paymentMethod: d.paymentDetails?.paymentMethod,
          upiId: d.paymentDetails?.upiId,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};