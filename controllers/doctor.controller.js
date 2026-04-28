import Queue from "../models/queue.model.js";
import Appointment from "../models/appointment.model.js";
import User from "../models/User.js";
import Patient from "../models/patient.model.js";
import Report from "../models/report.model.js";
import admin from "../utils/firebase.js";
import xlsx from "xlsx";
import jwt from "jsonwebtoken";

export const getTodayQueue = async (req, res) => {
  try {
    const doctorId = req.user._id;

    const today = req.query.date || new Date().toISOString().split("T")[0];

    let queue = await Queue.findOne({
      doctorId,
      date: today,
    });

    if (!queue) {
      queue = {
        currentToken: 0,
        lastIssuedToken: 0,
      };
    }

  const { slot, status } = req.query;

  const validStatuses = ["waiting", "completed", "cancelled", "in_progress"];
  const resolvedStatus = validStatuses.includes(status) ? status : "waiting";

  const appointmentQuery = {
    doctorId,
    date: today,
    status: resolvedStatus,
  };

  if (slot) {
    appointmentQuery.slot = slot;
  }

  const appointments = await Appointment.find(appointmentQuery)
    .populate("patientId", "fullName mobile profilePhoto")
    .sort({ tokenNumber: 1 });

    res.status(200).json({
      success: true,
      date: today,
      status: resolvedStatus,
      currentToken: queue.currentToken,
      lastIssuedToken: queue.lastIssuedToken,
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

export const nextToken = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const today = new Date().toISOString().split("T")[0];

    const queue = await Queue.findOne({
      doctorId,
      date: today,
    });

    if (!queue) {
      return res.status(404).json({
        success: false,
        message: "No queue found for today",
      });
    }

    if (queue.currentToken >= queue.lastIssuedToken) {
      return res.status(400).json({
        success: false,
        message: "No more patients waiting",
      });
    }

    const oldToken = queue.currentToken;
    const newToken = oldToken + 1;

    // complete previous token
    if (oldToken > 0) {
      await Appointment.findOneAndUpdate(
        {
          doctorId,
          date: today,
          tokenNumber: oldToken,
          status: "in_progress",
        },
        {
          status: "completed",
          completedAt: new Date(),
        }
      );
    }

    // start new token
    await Appointment.findOneAndUpdate(
      {
        doctorId,
        date: today,
        tokenNumber: newToken,
        status: "waiting",
      },
      {
        status: "in_progress",
      }
    );

    // update queue token
    queue.currentToken = newToken;
    await queue.save();

    // socket emit
    const io = req.app.get("io");
    const room = `doctor_${doctorId}`;
    const payload = { doctorId, currentToken: queue.currentToken, lastIssuedToken: queue.lastIssuedToken };
    console.log(`[SOCKET] nextToken emit | room=${room} | payload=${JSON.stringify(payload)}`);
    const roomSockets = await io.in(room).allSockets();
    console.log(`[SOCKET] Sockets in room ${room}: ${roomSockets.size}`);
    io.to(room).emit("tokenUpdated", payload);
    console.log(`[SOCKET] tokenUpdated emitted | room=${room}`);

    // 🔥 FIREBASE NOTIFICATION LOGIC
    const notifyToken = queue.currentToken + 5;

    const targetAppointments = await Appointment.find({
      doctorId,
      date: today,
      tokenNumber: notifyToken,
      status: "waiting",
    }).populate("patientId");

    for (const item of targetAppointments) {
      const fcmToken = item.patientId?.fcmToken;

      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: "Appointment Reminder",
              body: `Current token is ${queue.currentToken}. Your token is ${item.tokenNumber}. Please reach clinic soon.`,
            },
          });

          console.log("Notification sent to token:", item.tokenNumber);

        } catch (err) {
          console.log("FCM send failed:", err.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Moved to next token",
      currentToken: queue.currentToken,
      lastIssuedToken: queue.lastIssuedToken,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const markDone = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const appointmentId = req.params.id;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId,
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
        message: "Already completed",
      });
    }

    // mark completed
    appointment.status = "completed";
    appointment.completedAt = new Date();
    await appointment.save();

    const queue = await Queue.findOne({
      doctorId,
      date: appointment.date,
    });

    if (!queue) {
      return res.status(404).json({
        success: false,
        message: "Queue not found",
      });
    }

    // currentToken stays at the completed token number
    if (appointment.tokenNumber >= queue.currentToken) {
      queue.currentToken = appointment.tokenNumber;
    }

    await queue.save();

    // socket emit
    const io = req.app.get("io");
    const room = `doctor_${doctorId}`;
    const payload = { doctorId, currentToken: queue.currentToken, lastIssuedToken: queue.lastIssuedToken };
    console.log(`[SOCKET] markDone emit | room=${room} | payload=${JSON.stringify(payload)}`);
    const roomSockets = await io.in(room).allSockets();
    console.log(`[SOCKET] Sockets in room ${room}: ${roomSockets.size}`);
    io.to(room).emit("tokenUpdated", payload);
    console.log(`[SOCKET] tokenUpdated emitted | room=${room}`);

    // notify patient who is 5 tokens ahead of completed token
    const notifyToken = appointment.tokenNumber + 5;
    console.log(`[FCM] Searching for tokenNumber=${notifyToken} | date=${appointment.date} | doctorId=${doctorId}`);

    const targetAppointment = await Appointment.findOne({
      doctorId,
      date: appointment.date,
      tokenNumber: notifyToken,
      status: "waiting",
    }).populate("patientId");

    console.log(`[FCM] targetAppointment found=${!!targetAppointment} | fcmToken=${targetAppointment?.patientId?.fcmToken || "EMPTY"}`);

    if (targetAppointment?.patientId?.fcmToken) {
      try {
        await admin.messaging().send({
          token: targetAppointment.patientId.fcmToken,
          notification: {
            title: "Appointment Reminder",
            body: `Current token is ${appointment.tokenNumber}. Your token is ${notifyToken}. Please reach clinic soon.`,
          },
        });
        console.log(`[FCM] Notification sent to tokenNumber=${notifyToken}`);
      } catch (err) {
        console.log(`[FCM] Send failed for tokenNumber=${notifyToken}:`, err.message);
      }
    }

    res.status(200).json({
      success: true,
      message: "Appointment completed",
      currentToken: queue.currentToken,
      completedToken: appointment.tokenNumber,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const markPaid = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const appointmentId = req.params.id;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    appointment.paymentStatus = "paid";
    await appointment.save();

    res.status(200).json({
      success: true,
      message: "Payment marked as paid",
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
    const doctor = await User.findById(req.user._id);

    if (!doctor || doctor.role !== "doctor") {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = new Date();
    const next7Days = [];

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
          availableSlots: doctorDay.slots.map((slot) => `${slot.startTime} - ${slot.endTime}`),
        });
      }
    }

    res.status(200).json({
      success: true,
      doctorName: doctor.name,
      slots: next7Days,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDoctorProfile = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id).select(
      "-password -otp -otpExpiry -bankDetails -documents"
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    res.status(200).json({ success: true, doctor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDoctorDashboard = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const today = new Date().toISOString().split("T")[0];

    const appointments = await Appointment.find({
      doctorId,
      date: today,
    });

    const totalAppointments = appointments.filter((a) => a.status !== "cancelled").length;

    const revenue = appointments
      .filter((a) => a.paymentStatus === "paid")
      .reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const completed = appointments.filter((a) => a.status === "completed").length;
    const waiting = appointments.filter((a) => a.status === "waiting").length;
    const cancelled = appointments.filter((a) => a.status === "cancelled").length;

    return res.status(200).json({
      success: true,
      date: today,
      activeStatus: req.user.activeStatus,
      totalAppointments,
      completed,
      waiting,
      cancelled,
      revenue,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/doctor/reports
export const submitReport = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { subject, category, priority, description } = req.body;

    if (!subject || !category || !priority) {
      return res.status(400).json({
        success: false,
        message: "subject, category and priority are required",
      });
    }

    const report = await Report.create({
      doctorId,
      subject,
      category,
      priority,
      description,
    });

    await report.populate("doctorId", "name");

    res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      report: {
        ticketId: report.ticketId,
        userName: report.doctorId.name,
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

// PATCH /api/doctor/duty-status
export const toggleDutyStatus = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { activeStatus } = req.body;

    if (!["active", "inactive"].includes(activeStatus)) {
      return res.status(400).json({ success: false, message: "activeStatus must be 'active' or 'inactive'" });
    }

    const doctorAvailable = activeStatus === "active";

    const doctor = await User.findByIdAndUpdate(
      doctorId,
      { activeStatus, doctorAvailable },
      { new: true }
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // send notification to all today's waiting patients when doctor goes ON DUTY
    if (activeStatus === "active") {
      const today = new Date().toISOString().split("T")[0];

      const appointments = await Appointment.find({
        doctorId,
        date: today,
        status: "waiting",
      }).populate("patientId", "fcmToken fullName");

      const tokens = appointments
        .map((a) => a.patientId?.fcmToken)
        .filter(Boolean);

      console.log(`[DUTY] Doctor ${doctor.name} went ON DUTY | today=${today} | patients to notify=${tokens.length}`);

      for (const token of tokens) {
        try {
          await admin.messaging().send({
            token,
            notification: {
              title: "Clinic is now open!",
              body: `Dr. ${doctor.name} is now attending patients. Please be ready.`,
            },
          });
        } catch (err) {
          console.log(`[DUTY] FCM failed for token ${token}:`, err.message);
        }
      }
    }

    // emit real-time availability to patients in same city
    const io = req.app.get("io");
    const city = doctor.clinic?.city?.toLowerCase().trim();
    if (city) {
      io.to(`city_${city}`).emit("doctorAvailable", {
        doctorId: doctor._id,
        name: doctor.name,
        profilePhoto: doctor.profilePhoto || "",
        specialization: doctor.services?.[0] || "",
        experience: doctor.experience || 0,
        clinicName: doctor.clinic?.clinicName || "",
        city: doctor.clinic?.city || "",
        activeStatus,
        doctorAvailable,
      });
      console.log(`[SOCKET] doctorAvailable emitted | city=${city} | doctorAvailable=${doctorAvailable}`);
    }

    res.status(200).json({
      success: true,
      message: `You are now ${activeStatus === "active" ? "ON DUTY" : "OFF DUTY"}`,
      activeStatus: doctor.activeStatus,
      doctorAvailable: doctor.doctorAvailable,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/doctor/secondary-phone
export const setSecondaryPhone = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { secondaryPhone } = req.body;

    if (secondaryPhone === undefined) {
      return res.status(400).json({ success: false, message: "secondaryPhone is required" });
    }

    // if removing, skip conflict check
    if (secondaryPhone !== "") {
      const conflict = await User.findOne({ phone: secondaryPhone });
      if (conflict) {
        return res.status(400).json({ success: false, message: "This number is already registered as a doctor account" });
      }
    }

    await User.findByIdAndUpdate(doctorId, { secondaryPhone });

    const message = secondaryPhone === "" ? "Secondary phone removed" : "Secondary phone saved";
    res.status(200).json({ success: true, message, secondaryPhone });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/doctor/save-fcm-token
export const saveFcmToken = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ success: false, message: "fcmToken is required" });
    }

    await User.findByIdAndUpdate(doctorId, { fcmToken });

    res.status(200).json({ success: true, message: "FCM token saved" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/export-report?filter=last7days&token=JWT
export const exportReport = async (req, res) => {
  try {
    const { filter, startDate, endDate, token } = req.query;

    if (!token) return res.status(401).json({ success: false, message: "Token required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const doctor = await User.findById(decoded.id).select("-password");
    if (!doctor) return res.status(401).json({ success: false, message: "Unauthorized" });

    const doctorId = doctor._id;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let fromDate;

    if (filter === "last7days") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    } else if (filter === "last30days") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
    } else if (startDate && endDate) {
      fromDate = new Date(startDate);
      fromDate.setHours(0, 0, 0, 0);
      today.setTime(new Date(endDate).setHours(23, 59, 59, 999));
    } else {
      return res.status(400).json({ success: false, message: "Provide filter or startDate & endDate" });
    }

    const appointments = await Appointment.find({
      doctorId,
      status: "completed",
      completedAt: { $gte: fromDate, $lte: today },
    })
      .populate("patientId", "fullName mobile")
      .sort({ completedAt: -1 });

    const rows = appointments.map((a, i) => ({
      "S.No": i + 1,
      "Appointment ID": a.appointmentId || a._id.toString(),
      "Token Number": a.tokenNumber,
      "Patient Name": a.fullName || a.patientId?.fullName || "",
      "Mobile": a.phone || a.patientId?.mobile || "",
      "Date": a.date,
      "Slot": a.slot,
      "Consultation Fee": a.consultationFee,
      "Payment Method": a.paymentMethod,
      "Payment Status": a.paymentStatus,
      "Follow-up": a.isFollowup ? "Yes" : "No",
      "Completed At": a.completedAt ? new Date(a.completedAt).toLocaleString("en-IN") : "",
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, "Appointments");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `report_${filter || `${startDate}_to_${endDate}`}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/completed-appointments
export const getCompletedAppointments = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { filter, startDate, endDate } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let fromDate;

    if (filter === "last7days") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    } else if (filter === "last30days") {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
    } else if (startDate && endDate) {
      fromDate = new Date(startDate);
      fromDate.setHours(0, 0, 0, 0);
      today.setTime(new Date(endDate).setHours(23, 59, 59, 999));
    } else {
      return res.status(400).json({
        success: false,
        message: "Provide filter=last7days or filter=last30days or startDate & endDate",
      });
    }

    const matchQuery = {
      doctorId,
      status: "completed",
      completedAt: { $gte: fromDate, $lte: today },
    };

    const [total, allForRevenue, appointments] = await Promise.all([
      Appointment.countDocuments(matchQuery),
      Appointment.find(matchQuery).select("consultationFee"),
      Appointment.find(matchQuery)
        .populate("patientId", "fullName mobile")
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const totalRevenue = allForRevenue.reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const result = appointments.map((a) => ({
      appointmentId: a.appointmentId || a._id,
      patientName: a.fullName || a.patientId?.fullName || "",
      mobile: a.phone || a.patientId?.mobile || "",
      date: a.date,
      slot: a.slot,
      tokenNumber: a.tokenNumber,
      consultationFee: a.consultationFee,
      paymentMethod: a.paymentMethod,
      paymentStatus: a.paymentStatus,
      isFollowup: a.isFollowup,
      completedAt: a.completedAt,
    }));

    res.status(200).json({
      success: true,
      total,
      totalRevenue,
      page,
      totalPages: Math.ceil(total / limit),
      appointments: result,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/reports
export const getMyReports = async (req, res) => {
  try {
    const doctorId = req.user._id;

    const reports = await Report.find({ doctorId })
      .populate("doctorId", "name")
      .sort({ createdAt: -1 });

    const formatted = reports.map((r) => ({
      ticketId: r.ticketId,
      userName: r.doctorId.name,
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

// POST /api/doctor/create-appointment
export const createWalkInAppointment = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { fullName, email, phone, problem, paymentMethod, date, slot } = req.body;

    if (!fullName || !phone || !paymentMethod || !date || !slot) {
      return res.status(400).json({ success: false, message: "fullName, phone, paymentMethod, date and slot are required" });
    }

    const doctor = await User.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // find or create patient by phone so they can log in later and see this appointment
    let patient = await Patient.findOne({ mobile: phone });
    if (!patient) {
      patient = await Patient.create({ mobile: phone, fullName, email: email || "" });
    }

    let queue = await Queue.findOne({ doctorId, date });
    if (!queue) {
      queue = await Queue.create({ doctorId, date, currentToken: 0, lastIssuedToken: 0 });
    }

    const tokenNumber = queue.lastIssuedToken + 1;
    queue.lastIssuedToken = tokenNumber;
    await queue.save();

    const consultationFee = doctor.clinic?.consultationFee || 0;
    const paymentStatus = paymentMethod === "online" ? "pending" : "cash_pending";

    const docPrefix = (doctor.name || "XX").replace(/\s+/g, "").substring(0, 2).toUpperCase();
    const patPrefix = (fullName || "XX").replace(/\s+/g, "").substring(0, 2).toUpperCase();
    const mobPrefix = (phone || "00").substring(0, 2);
    const unique = Math.random().toString(36).substring(2, 4).toUpperCase();
    const appointmentId = `${docPrefix}${patPrefix}${mobPrefix}${unique}`;

    const appointment = await Appointment.create({
      appointmentId,
      doctorId,
      patientId: patient._id,
      date,
      slot,
      tokenNumber,
      fullName,
      email: email || "",
      phone,
      problem: problem || "",
      paymentMethod,
      paymentStatus,
      consultationFee,
      isFollowup: false,
      status: "waiting",
    });

    // emit dashboard update to doctor's room
    const io = req.app.get("io");
    const room = `doctor_${doctorId}`;
    io.to(room).emit("dashboardUpdated", { doctorId, lastIssuedToken: queue.lastIssuedToken });

    res.status(201).json({
      success: true,
      message: "Walk-in appointment created",
      tokenNumber,
      appointmentId,
      consultationFee,
      paymentStatus,
      appointment,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/settings
export const getDoctorSettings = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id).select("availability services");
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    res.status(200).json({
      success: true,
      availability: doctor.availability || [],
      services: doctor.services || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/doctor/settings/availability
export const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;

    if (!Array.isArray(availability)) {
      return res.status(400).json({ success: false, message: "availability must be an array" });
    }

    const doctor = await User.findByIdAndUpdate(
      req.user._id,
      { availability },
      { new: true }
    ).select("availability");

    res.status(200).json({
      success: true,
      message: "Availability updated",
      availability: doctor.availability,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/doctor/settings/services
export const updateServices = async (req, res) => {
  try {
    const { action, service } = req.body;

    if (!action || !service) {
      return res.status(400).json({ success: false, message: "action (add/remove) and service are required" });
    }

    const doctor = await User.findById(req.user._id);
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    if (action === "add") {
      if (!doctor.services.includes(service)) {
        doctor.services.push(service);
      }
    } else if (action === "remove") {
      doctor.services = doctor.services.filter((s) => s !== service);
    } else {
      return res.status(400).json({ success: false, message: "action must be 'add' or 'remove'" });
    }

    await doctor.save();

    res.status(200).json({
      success: true,
      message: `Service ${action === "add" ? "added" : "removed"}`,
      services: doctor.services,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};