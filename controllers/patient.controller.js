import jwt from "jsonwebtoken";
import Patient from "../models/patient.model.js";
import User from "../models/User.js";
import Appointment from "../models/appointment.model.js";
import Queue from "../models/queue.model.js";
import PatientReport from "../models/patientReport.model.js";
import Review from "../models/review.model.js";
import Clinic from "../models/clinic.model.js";
import Notification from "../models/notification.model.js";
import { checkAndDeductToken, refundToken } from "../utils/tokenGuard.js";

const slotLabel = (n) => (n != null ? String.fromCharCode(64 + n) : "");

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
            { id: patient._id, role: "patient", tokenVersion: patient.tokenVersion },
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


export const getDoctorByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    // Check doctor's own phone first
    let doctor = await User.findOne({
      phone,
      role: "doctor",
      status: "approved",
    }).select("-password -employees.otp -employees.otpExpiry");

    // Fallback: check if phone belongs to an employee of any doctor
    if (!doctor) {
      doctor = await User.findOne({
        role: "doctor",
        status: "approved",
        "employees.phone": phone,
        "employees.verified": true,
      }).select("-password -employees.otp -employees.otpExpiry");
    }

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const doctorObj = doctor.toObject();
    res.status(200).json({
      success: true,
      doctor: {
        ...doctorObj,
        clinic: {
          ...doctorObj.clinic,
          clinicId: doctorObj.clinicId ?? null,
        },
      },
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
          consultationFee: doctor.clinic?.consultationFee ?? 0,
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
      activeStatus: "active",
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not available for booking",
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
    const maxPatientsPerSlot = doctor.maxPatientsPerSlot || 12;
    const slotBookings = await Appointment.countDocuments({
      doctorId,
      date,
      slot,
      status: { $ne: "cancelled" },
    });

    if (slotBookings >= maxPatientsPerSlot) {
      return res.status(400).json({
        success: false,
        message: "This slot is fully booked. Please choose another slot.",
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

    // determine slotNumber from doctor's availability for that day
    const slotIndex = dayAvailability?.slots.findIndex(
      (s) => `${s.startTime} - ${s.endTime}` === slot
    ) ?? -1;
    const slotNumber = slotIndex + 1;

    // per-slot queue
    let queue = await Queue.findOne({ doctorId, date });
    if (!queue) {
      queue = new Queue({ doctorId, date, slotQueues: [] });
    }
    let slotQueue = queue.slotQueues.find((s) => s.slot === slot);
    if (!slotQueue) {
      queue.slotQueues.push({ slot, slotNumber, currentToken: 0, lastIssuedToken: 0 });
      slotQueue = queue.slotQueues[queue.slotQueues.length - 1];
    }
    const slotTokenNumber = slotQueue.lastIssuedToken + 1;
    slotQueue.lastIssuedToken = slotTokenNumber;
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
      slotNumber,
      tokenNumber: slotTokenNumber,
      slotTokenNumber,
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
    io.to(room).emit("dashboardUpdated", {
      doctorId,
      slot,
      slotNumber: slotLabel(slotNumber),
      lastIssuedToken: slotQueue.lastIssuedToken,
    });

    const parseSlotTime = (str) => {
      const s = str.trim();
      const isPM = /pm/i.test(s);
      const isAM = /am/i.test(s);
      const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
      let hour = h;
      if (isPM && hour !== 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };

    const [slotStartPart] = slot.split(" - ").map((s) => s.trim());
    const slotStartMins = parseSlotTime(slotStartPart);

    const nowISTMins = Math.floor((Date.now() + 5.5 * 60 * 60 * 1000) / 60000) % (24 * 60);
    const effectiveBase = Math.max(slotStartMins, nowISTMins);
    const currentTokenAtBooking = slotQueue.currentToken || 0;
    const waitMinsAtBooking = Math.max(0, (slotTokenNumber - currentTokenAtBooking - 1) * 5);
    const totalMins = effectiveBase + waitMinsAtBooking;
    const estHour = Math.floor(totalMins / 60) % 24;
    const estMin = totalMins % 60;
    const period = estHour >= 12 ? "PM" : "AM";
    const displayHour = estHour % 12 || 12;
    const expectedTime = `${String(displayHour).padStart(2, "0")}:${String(estMin).padStart(2, "0")} ${period}`;

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      slotNumber: slotLabel(slotNumber),
      tokenNumber: slotTokenNumber,
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
    const { status, clinicId } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const STATUS_MAP = { pending: "waiting", complete: "completed" };
    const mappedStatus = STATUS_MAP[status] || status;

    const query = { patientId };
    if (mappedStatus) query.status = mappedStatus;

    if (clinicId) {
      const clinicDoctors = await User.find({ clinicId, role: "doctor", status: "approved" }).select("_id");
      query.doctorId = { $in: clinicDoctors.map((d) => d._id) };
    }

    const baseCountQuery = clinicId ? { patientId, doctorId: query.doctorId } : { patientId };

    const [total, upcomingCount, completedCount, appointments] = await Promise.all([
      Appointment.countDocuments(query),
      Appointment.countDocuments({ ...baseCountQuery, status: { $in: ["waiting", "in_progress"] } }),
      Appointment.countDocuments({ ...baseCountQuery, status: "completed" }),
      Appointment.find(query)
        .populate({ path: "doctorId", select: "name profilePhoto services clinic clinicId experience maxPatientsPerSlot" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const parseSlotTime = (str) => {
      const s = str.trim();
      const isPM = /pm/i.test(s);
      const isAM = /am/i.test(s);
      const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
      let hour = h;
      if (isPM && hour !== 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };

    const formatTime = (totalMin) => {
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      const period = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
    };

    // Batch-check which appointments this patient has already rated
    const appointmentIds = appointments.map((a) => a._id);
    const existingReviews = await Review.find({ patientId, appointmentId: { $in: appointmentIds } }).select("appointmentId");
    const ratedAppointmentIds = new Set(existingReviews.map((r) => r.appointmentId.toString()));

    const result = [];

    for (const item of appointments) {
      const queue = await Queue.findOne({
        doctorId: item.doctorId?._id,
        date: item.date,
      });

      const slotQ = queue?.slotQueues?.find((s) => s.slot === item.slot);
      const currentToken = slotQ?.currentToken || 0;

      let estimatedTime = null;
      if (["waiting", "in_progress"].includes(item.status) && item.slot) {
        const [startPart] = item.slot.split(" - ").map((s) => s.trim());
        const slotStart = parseSlotTime(startPart);
        const slotPos = item.slotTokenNumber ?? item.tokenNumber;
        const nowISTMins = Math.floor((Date.now() + 5.5 * 60 * 60 * 1000) / 60000) % (24 * 60);
        const effectiveBase = Math.max(slotStart, nowISTMins);
        const waitMins = Math.max(0, (slotPos - currentToken - 1) * 5);
        const totalMin = effectiveBase + waitMins;
        estimatedTime = formatTime(totalMin);
      }

      result.push({
        id: item._id,
        status: item.status,
        slotNumber: slotLabel(item.slotNumber),
        tokenNumber: item.slotTokenNumber,
        currentToken,
        date: item.date,
        slot: item.slot,
        time: item.time,
        estimatedTime,
        doctor: {
          id: item.doctorId?._id || "",
          name: item.doctorId?.name || "",
          profilePhoto: item.doctorId?.profilePhoto || "",
          specialization: item.doctorId?.services?.[0] || "General",
          services: item.doctorId?.services || [],
          experience: item.doctorId?.experience || 0,
        },
        clinic: {
          clinicId: item.doctorId?.clinicId ?? null,
          clinicName: item.doctorId?.clinic?.clinicName || "",
          city: item.doctorId?.clinic?.city || "",
          googleBusinessLink: item.doctorId?.clinic?.googleBusinessLink || "",
        },
        hasRated: ratedAppointmentIds.has(item._id.toString()),
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

    const refund = await refundToken(appointment.doctorId);
    if (refund?.walletBalance !== undefined) {
      const io = req.app.get("io");
      io.to(`doctor_${appointment.doctorId}`).emit("walletUpdated", {
        walletBalance: refund.walletBalance,
        tokensAvailable: refund.tokensAvailable,
      });
    }

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

    const slotQueue = queue?.slotQueues?.find((s) => s.slot === appointment.slot);
    const currentToken = slotQueue?.currentToken || 0;

    let patientsAhead = appointment.slotTokenNumber - currentToken;

    if (patientsAhead < 0) patientsAhead = 0;

    res.status(200).json({
      success: true,
      slotNumber: slotLabel(appointment.slotNumber),
      slot: appointment.slot,
      yourToken: appointment.slotTokenNumber,
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
      select: "name clinic profilePhoto maxPatientsPerSlot",
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

    let estimatedTime = null;
    if (["waiting", "in_progress"].includes(appointment.status) && appointment.slot) {
      const parseSlotTimeFmt = (str) => {
        const s = str.trim();
        const isPM = /pm/i.test(s);
        const isAM = /am/i.test(s);
        const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
        let hour = h;
        if (isPM && hour !== 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        return hour * 60 + (m || 0);
      };

      const [startPart] = appointment.slot.split(" - ").map((s) => s.trim());
      const slotStartMins = parseSlotTimeFmt(startPart);
      const slotPos = appointment.slotTokenNumber ?? appointment.tokenNumber;

      const queueDoc = await Queue.findOne({ doctorId: appointment.doctorId, date: appointment.date });
      const slotQ = queueDoc?.slotQueues?.find((s) => s.slot === appointment.slot);
      const currentToken = slotQ?.currentToken || 0;

      const nowISTMins = Math.floor((Date.now() + 5.5 * 60 * 60 * 1000) / 60000) % (24 * 60);
      const effectiveBase = Math.max(slotStartMins, nowISTMins);
      const waitMins = Math.max(0, (slotPos - currentToken - 1) * 5);
      const totalMin = effectiveBase + waitMins;

      const calcTime = (min) => {
        const h = Math.floor(min / 60) % 24;
        const m = min % 60;
        const period = h >= 12 ? "PM" : "AM";
        const displayH = h % 12 || 12;
        return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
      };

      estimatedTime = calcTime(totalMin);
    }

    res.status(200).json({
      success: true,
      appointment: {
        id: appointment._id,
        displayId,
        slotNumber: slotLabel(appointment.slotNumber),
        tokenNumber: appointment.slotTokenNumber,
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

        estimatedTime,
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

    // Use IST (UTC+5:30) for all time/date comparisons
    const IST_OFFSET = 330 * 60 * 1000;
    const istNow = new Date(Date.now() + IST_OFFSET);
    const currentMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

    const parseTime = (str) => {
      const s = str.trim();
      const isPM = /pm/i.test(s);
      const isAM = /am/i.test(s);
      const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
      let hour = h;
      if (isPM && hour !== 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday"
    ];

    const next7Days = [];

    for (let i = 0; i < 7; i++) {
      const current = new Date(istNow);
      current.setUTCDate(istNow.getUTCDate() + i);

      const dayName = dayNames[current.getUTCDay()];

      const doctorDay = doctor.availability.find(
        (item) => item.day === dayName && item.isActive
      );

      if (doctorDay) {
        let slots = doctorDay.slots;

        // for today, remove slots whose end time has already passed
        if (i === 0) {
          slots = slots.filter((slot) => parseTime(slot.endTime) > currentMinutes);
        }

        if (slots.length > 0) {
          next7Days.push({
            date: current.toISOString().split("T")[0],
            day: dayName,
            availableSlots: slots.map((slot) => `${slot.startTime} - ${slot.endTime}`)
          });
        }
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
      return res.status(400).json({ success: false, message: "date and slot are required" });
    }

    const doctor = await User.findById(doctorId).select("clinic maxPatientsPerSlot availability");
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const [queue, lastBooked] = await Promise.all([
      Queue.findOne({ doctorId, date }),
      Appointment.findOne({ doctorId, date, slot, status: { $ne: "cancelled" } }).sort({ slotTokenNumber: -1 }),
    ]);

    const slotQ = queue?.slotQueues?.find((s) => s.slot === slot);
    const currentToken = slotQ?.currentToken || 0;

    const selectedDay = new Date(date).toLocaleDateString("en-US", { weekday: "long" });
    const dayAvailability = doctor.availability?.find((d) => d.day === selectedDay && d.isActive);
    const slotIndex = dayAvailability?.slots.findIndex((s) => `${s.startTime} - ${s.endTime}` === slot) ?? -1;
    const slotNumber = slotLabel(slotQ?.slotNumber ?? (slotIndex >= 0 ? slotIndex + 1 : null));
    const yourToken = lastBooked ? lastBooked.slotTokenNumber + 1 : 1;

    const parseSlotTime = (str) => {
      const s = str.trim();
      const isPM = /pm/i.test(s);
      const isAM = /am/i.test(s);
      const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
      let hour = h;
      if (isPM && hour !== 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };

    const [startPart] = slot.split(" - ").map((s) => s.trim());
    const slotStart = parseSlotTime(startPart);

    const waitMinutes = Math.max(0, (yourToken - currentToken - 1) * 5);

    const nowISTMins = Math.floor((Date.now() + 5.5 * 60 * 60 * 1000) / 60000) % (24 * 60);
    const effectiveBase = Math.max(slotStart, nowISTMins);
    const totalMins = effectiveBase + waitMinutes;
    const estHour = Math.floor(totalMins / 60) % 24;
    const estMin = totalMins % 60;
    const period = estHour >= 12 ? "PM" : "AM";
    const displayHour = estHour % 12 || 12;
    const estimatedTime = `${String(displayHour).padStart(2, "0")}:${String(estMin).padStart(2, "0")} ${period}`;

    res.json({
      success: true,
      slotNumber,
      currentToken,
      yourToken,
      estimatedWaitMinutes: waitMinutes,
      estimatedTime,
      freeFollowupDays: doctor.clinic?.freeFollowupDays || 0,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    const { rating, review, appointmentId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "approved" });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const patient = await Patient.findById(patientId);
    const patientName = patient?.fullName || "Anonymous";

    const existing = await Review.findOne({ appointmentId, patientId });
    if (existing) {
      existing.rating = rating;
      existing.review = review || "";
      existing.patientName = patientName;
      await existing.save();
    } else {
      await Review.create({ doctorId, patientId, patientName, rating, review: review || "", appointmentId });
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
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "approved" });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const [totalRatings, allRatings, reviews] = await Promise.all([
      Review.countDocuments({ doctorId }),
      Review.find({ doctorId }).select("rating"),
      Review.find({ doctorId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const averageRating = totalRatings
      ? parseFloat((allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings).toFixed(1))
      : 0;

    res.status(200).json({
      success: true,
      averageRating,
      totalRatings,
      page,
      totalPages: Math.ceil(totalRatings / limit),
      hasMore: page < Math.ceil(totalRatings / limit),
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

// GET /api/patient/appointment-stats?clinicId=...
export const getAppointmentStats = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { clinicId } = req.query;

    const baseFilter = { patientId };

    if (clinicId) {
      const doctors = await User.find({ clinicId, role: "doctor" }).select("_id");
      const doctorIds = doctors.map((d) => d._id);
      baseFilter.doctorId = { $in: doctorIds };
    }

    const [completedCount, upcomingCount, cancelledCount] = await Promise.all([
      Appointment.countDocuments({ ...baseFilter, status: "completed" }),
      Appointment.countDocuments({ ...baseFilter, status: { $in: ["waiting", "in_progress"] } }),
      Appointment.countDocuments({ ...baseFilter, status: "cancelled" }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalBooked: completedCount + upcomingCount + cancelledCount,
        completed: completedCount,
        upcoming: upcomingCount,
        cancelled: cancelledCount,
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

// GET /api/patient/clinics?city=...&state=...
export const getAllClinics = async (req, res) => {
  try {
    const { city, state } = req.query;

    const clinicFilter = { isActive: { $ne: false } };
    if (city) clinicFilter.city = { $regex: city, $options: "i" };
    if (state) clinicFilter.state = { $regex: state, $options: "i" };

    const clinics = await Clinic.find(clinicFilter).sort({ createdAt: -1 });

    const clinicIds = clinics.map((c) => c._id);

    const doctors = await User.find({
      clinicId: { $in: clinicIds },
      role: "doctor",
      status: "approved",
      activeStatus: "active",
      deletionRequested: { $ne: true },
    }).select("name profilePhoto services experience doctorAvailable activeStatus clinic clinicId qualifications");

    const doctorsByClinic = {};
    for (const d of doctors) {
      const key = d.clinicId.toString();
      if (!doctorsByClinic[key]) doctorsByClinic[key] = [];
      doctorsByClinic[key].push(d);
    }

    const result = clinics
      .filter((c) => doctorsByClinic[c._id.toString()]?.length > 0)
      .map((c) => {
      const clinicDoctors = doctorsByClinic[c._id.toString()] || [];
      const firstDoc = clinicDoctors[0];
      return {
        id: c._id,
        clinicName: c.clinicName,
        address: c.address,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        country: c.country,
        phone: c.phone,
        photos: c.photos,
        consultationFee: firstDoc?.clinic?.consultationFee ?? 0,
        rating: firstDoc?.clinic?.rating ?? 0,
        latitude: firstDoc?.clinic?.latitude ?? null,
        longitude: firstDoc?.clinic?.longitude ?? null,
        googleBusinessLink: firstDoc?.clinic?.googleBusinessLink || "",
        doctors: clinicDoctors.map((d) => ({
          id: d._id,
          name: d.name,
          profilePhoto: d.profilePhoto || "",
          services: d.services,
          qualifications: d.qualifications,
          experience: d.experience,
          doctorAvailable: d.doctorAvailable,
          activeStatus: d.activeStatus,
        })),
      };
    });

    res.status(200).json({
      success: true,
      total: result.length,
      clinics: result,
    });
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

    const firstDoc = doctors[0];

    res.status(200).json({
      success: true,
      clinic: {
        id: clinic._id,
        clinicName: clinic.clinicName || "",
        about: firstDoc?.clinic?.about || "",
        address: clinic.address || "",
        city: clinic.city || "",
        state: clinic.state || "",
        pincode: clinic.pincode || "",
        country: clinic.country || "",
        consultationFee: firstDoc?.clinic?.consultationFee ?? 0,
        freeFollowupDays: firstDoc?.clinic?.freeFollowupDays ?? 0,
        rating: firstDoc?.clinic?.rating ?? 0,
        latitude: firstDoc?.clinic?.latitude ?? null,
        longitude: firstDoc?.clinic?.longitude ?? null,
        photos: clinic.photos || [],
        googleBusinessLink: firstDoc?.clinic?.googleBusinessLink || "",
        phone: clinic.phone || "",
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
        consultationFee: d.clinic?.consultationFee ?? 0,
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

// GET /api/patient/visit-time?doctorId=...&date=...&slot=...&tokenNumber=...
export const getVisitTimeEstimate = async (req, res) => {
  try {
    const { doctorId, date, slot, tokenNumber } = req.query;

    if (!doctorId || !date || !slot || !tokenNumber) {
      return res.status(400).json({
        success: false,
        message: "doctorId, date, slot and tokenNumber are required",
      });
    }

    const token = parseInt(tokenNumber);
    if (isNaN(token) || token < 1) {
      return res.status(400).json({ success: false, message: "Invalid tokenNumber" });
    }

    if (!await User.exists({ _id: doctorId })) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // supports both "HH:MM" (24-hr) and "H:MM AM/PM" (12-hr) formats
    const parseTime = (str) => {
      const s = str.trim();
      const isPM = /pm/i.test(s);
      const isAM = /am/i.test(s);
      const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
      let hour = h;
      if (isPM && hour !== 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };

    const [startPart] = slot.split(" - ").map((s) => s.trim());
    const slotStartMinutes = parseTime(startPart);

    const waitingAhead = await Appointment.countDocuments({
      doctorId,
      date,
      slot,
      status: "waiting",
      slotTokenNumber: { $lt: token },
    });

    const totalMinutes = slotStartMinutes + (token - 1) * 5;
    const estHour = Math.floor(totalMinutes / 60) % 24;
    const estMin = totalMinutes % 60;
    const period = estHour >= 12 ? "PM" : "AM";
    const displayHour = estHour % 12 || 12;
    const estimatedTime = `${String(displayHour).padStart(2, "0")}:${String(estMin).padStart(2, "0")} ${period}`;

    res.json({
      success: true,
      tokenNumber: token,
      estimatedTime,
      minutesPerPatient: 5,
      waitingAhead,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMySessions = async (req, res) => {
  try {
    const patientId = req.patient.id;

    const appointments = await Appointment.find({ patientId }).populate({
      path: "doctorId",
      select: "name profilePhoto services clinic clinicId experience maxPatientsPerSlot",
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sort: upcoming (date >= today) first, then past — newest date first within each group
    appointments.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      const aUpcoming = dateA >= today;
      const bUpcoming = dateB >= today;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return dateB - dateA;
    });

    const parseSlotTime = (str) => {
      const s = str.trim();
      const isPM = /pm/i.test(s);
      const isAM = /am/i.test(s);
      const [h, m] = s.replace(/[a-zA-Z\s]/g, "").split(":").map(Number);
      let hour = h;
      if (isPM && hour !== 12) hour += 12;
      if (isAM && hour === 12) hour = 0;
      return hour * 60 + (m || 0);
    };

    const calcEstimatedTime = (slot, slotTokenNumber) => {
      if (!slot || !slotTokenNumber) return null;
      const [startPart] = slot.split(" - ").map((s) => s.trim());
      const slotStart = parseSlotTime(startPart);
      const totalMin = slotStart + (slotTokenNumber - 1) * 5;
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      const period = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
    };

    const formatSession = (item) => ({
      id: item._id,
      date: item.date,
      slot: item.slot,
      slotNumber: slotLabel(item.slotNumber),
      tokenNumber: item.slotTokenNumber,
      estimatedTime: calcEstimatedTime(item.slot, item.slotTokenNumber),
      status: item.status,
      paymentStatus: item.paymentStatus,
      consultationFee: item.consultationFee,
      problem: item.problem || null,
      doctor: {
        id: item.doctorId?._id || "",
        name: item.doctorId?.name || "",
        profilePhoto: item.doctorId?.profilePhoto || "",
        specialization: item.doctorId?.services?.[0] || "General",
      },
      clinic: {
        clinicId: item.doctorId?.clinicId ?? null,
        clinicName: item.doctorId?.clinic?.clinicName || "",
        address: item.doctorId?.clinic?.address || "",
        city: item.doctorId?.clinic?.city || "",
        googleBusinessLink: item.doctorId?.clinic?.googleBusinessLink || "",
      },
    });

    // Deduplicate by clinic — keep only the most recent appointment per clinic
    const seenClinics = new Set();
    const sessions = [];
    for (const appointment of appointments) {
      const clinicKey = String(appointment.doctorId?.clinicId ?? appointment.doctorId?._id ?? appointment._id);
      if (!seenClinics.has(clinicKey)) {
        seenClinics.add(clinicKey);
        sessions.push(formatSession(appointment));
      }
    }

    res.status(200).json({
      success: true,
      sessions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/doctors/:id/free-followup
export const checkFreeFollowup = async (req, res) => {
  try {
    const patientId = req.patient.id;
    const doctorId = req.params.id;

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "approved" }).select("clinic.freeFollowupDays");
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const freeFollowupDays = doctor.clinic?.freeFollowupDays || 0;

    if (freeFollowupDays === 0) {
      return res.status(200).json({ success: true, freeFollowup: false });
    }

    const referenceDate = req.query.date ? new Date(req.query.date) : new Date();
    if (isNaN(referenceDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
    }
    if (req.query.date) referenceDate.setHours(23, 59, 59, 999);

    const lastCompleted = await Appointment.findOne({
      doctorId,
      patientId,
      status: "completed",
      completedAt: { $lte: referenceDate },
    }).sort({ completedAt: -1 }).select("completedAt");

    if (!lastCompleted?.completedAt) {
      return res.status(200).json({ success: true, freeFollowup: false });
    }

    const daysSinceLast = (referenceDate - new Date(lastCompleted.completedAt)) / (1000 * 60 * 60 * 24);
    const freeFollowup = daysSinceLast <= freeFollowupDays;

    const expiresOn = new Date(new Date(lastCompleted.completedAt).getTime() + freeFollowupDays * 24 * 60 * 60 * 1000);

    return res.status(200).json({
      success: true,
      freeFollowup,
      lastVisitDate: lastCompleted.completedAt,
      expiresOn,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/patient/clinic-guard?clinicId=...
export const checkClinicGuard = async (req, res) => {
  try {
    const { clinicId } = req.query;

    if (!clinicId) {
      return res.status(400).json({ success: false, message: "clinicId is required" });
    }

    const inactiveDoctor = await User.findOne({
      clinicId,
      role: "doctor",
      activeStatus: "inactive",
    }).select("_id");

    if (inactiveDoctor) {
      return res.status(200).json({
        success: true,
        forceLogout: true,
        message: "Doctor is no longer available. Please log in again.",
      });
    }

    return res.status(200).json({ success: true, forceLogout: false });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};