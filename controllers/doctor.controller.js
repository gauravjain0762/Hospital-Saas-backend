import Queue from "../models/queue.model.js";
import Appointment from "../models/appointment.model.js";
import User from "../models/User.js";
import Patient from "../models/patient.model.js";
import Report from "../models/report.model.js";
import Review from "../models/review.model.js";
import Plan from "../models/plan.model.js";
import WalletTransaction from "../models/walletTransaction.model.js";
import Clinic from "../models/clinic.model.js";
import Notification from "../models/notification.model.js";
import admin from "../utils/firebase.js";
import xlsx from "xlsx";
import jwt from "jsonwebtoken";
import { checkAndDeductToken, refundToken } from "../utils/tokenGuard.js";

const slotLabel = (n) => (n != null ? String.fromCharCode(64 + n) : "");

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

const calcEstimatedTime = (slot, slotTokenNumber, currentToken = 0) => {
  const [startPart, endPart] = slot.split(" - ").map((s) => s.trim());
  const slotStart = parseSlotTime(startPart);
  const slotEnd = parseSlotTime(endPart);
  const nowISTMins = Math.floor((Date.now() + 5.5 * 60 * 60 * 1000) / 60000) % (24 * 60);
  const effectiveBase = Math.max(slotStart, nowISTMins);
  const waitMins = Math.max(0, (slotTokenNumber - currentToken - 1) * 5);
  const totalMins = Math.min(effectiveBase + waitMins, slotEnd);
  const estHour = Math.floor(totalMins / 60) % 24;
  const estMin = totalMins % 60;
  const period = estHour >= 12 ? "PM" : "AM";
  const displayHour = estHour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${String(estMin).padStart(2, "0")} ${period}`;
};

export const getTodayQueue = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const today = req.query.date || new Date().toISOString().split("T")[0];

    const queue = await Queue.findOne({ doctorId, date: today });

    const { slot, status } = req.query;

    const validStatuses = ["waiting", "completed", "cancelled", "in_progress"];
    const resolvedStatus = validStatuses.includes(status) ? status : "waiting";

    const appointmentQuery = { doctorId, date: today, status: resolvedStatus };
    if (slot) appointmentQuery.slot = slot;

    // build per-slot summary
    const slotQueues = queue?.slotQueues || [];

    const currentTokenBySlot = {};
    for (const sq of slotQueues) {
      currentTokenBySlot[sq.slot] = sq.currentToken || 0;
    }

    const appointments = (await Appointment.find(appointmentQuery)
      .populate("patientId", "fullName mobile profilePhoto")
      .sort({ slotNumber: 1, slotTokenNumber: 1 }))
      .map((a) => ({
        ...a.toObject(),
        slotNumber: slotLabel(a.slotNumber),
        estimatedTime: calcEstimatedTime(a.slot, a.slotTokenNumber, currentTokenBySlot[a.slot] || 0),
      }));
    const slotSummary = slotQueues.map((sq) => ({
      slot: sq.slot,
      slotNumber: slotLabel(sq.slotNumber),
      currentToken: sq.currentToken,
      lastIssuedToken: sq.lastIssuedToken,
    }));

    // if filtering by slot, also return that slot's token counters
    let currentToken = 0;
    let lastIssuedToken = 0;
    let slotNumber = null;
    if (slot) {
      const sq = slotQueues.find((s) => s.slot === slot);
      currentToken = sq?.currentToken ?? 0;
      lastIssuedToken = sq?.lastIssuedToken ?? 0;
      slotNumber = sq ? slotLabel(sq.slotNumber) : null;
    }

    res.status(200).json({
      success: true,
      date: today,
      status: resolvedStatus,
      slotQueues: slotSummary,
      // slot-specific counters when slot filter is provided
      ...(slot && { slotNumber, currentToken, lastIssuedToken }),
      count: appointments.length,
      appointments,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const nextToken = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const today = new Date().toISOString().split("T")[0];
    const { slot } = req.body;

    if (!slot) {
      return res.status(400).json({ success: false, message: "slot is required" });
    }

    const queue = await Queue.findOne({ doctorId, date: today });

    if (!queue) {
      return res.status(404).json({ success: false, message: "No queue found for today" });
    }

    const slotQueue = queue.slotQueues.find((s) => s.slot === slot);

    if (!slotQueue) {
      return res.status(404).json({ success: false, message: "No queue found for this slot" });
    }

    if (slotQueue.currentToken >= slotQueue.lastIssuedToken) {
      return res.status(400).json({ success: false, message: "No more patients waiting in this slot" });
    }

    const oldToken = slotQueue.currentToken;
    const newToken = oldToken + 1;

    // complete previous token in this slot
    if (oldToken > 0) {
      await Appointment.findOneAndUpdate(
        { doctorId, date: today, slot, slotTokenNumber: oldToken, status: "in_progress" },
        { status: "completed", completedAt: new Date() }
      );
    }

    // start new token in this slot
    await Appointment.findOneAndUpdate(
      { doctorId, date: today, slot, slotTokenNumber: newToken, status: "waiting" },
      { status: "in_progress" }
    );

    slotQueue.currentToken = newToken;
    await queue.save();

    // socket emit
    const io = req.app.get("io");
    const room = `doctor_${doctorId}`;
    const payload = {
      doctorId,
      slot,
      slotNumber: slotLabel(slotQueue.slotNumber),
      currentToken: slotQueue.currentToken,
      lastIssuedToken: slotQueue.lastIssuedToken,
    };
    io.to(room).emit("tokenUpdated", payload);

    res.status(200).json({
      success: true,
      message: "Moved to next token",
      slot,
      slotNumber: slotLabel(slotQueue.slotNumber),
      currentToken: slotQueue.currentToken,
      lastIssuedToken: slotQueue.lastIssuedToken,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markDone = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const appointmentId = req.params.id;

    const appointment = await Appointment.findOne({ _id: appointmentId, doctorId });

    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.status === "completed") {
      return res.status(400).json({ success: false, message: "Already completed" });
    }

    appointment.status = "completed";
    appointment.completedAt = new Date();
    await appointment.save();

    const queue = await Queue.findOne({ doctorId, date: appointment.date });

    if (queue) {
      const slotQueue = queue.slotQueues.find((s) => s.slot === appointment.slot);
      if (slotQueue && appointment.slotTokenNumber >= slotQueue.currentToken) {
        slotQueue.currentToken = appointment.slotTokenNumber;
        await queue.save();
      }

      // socket emit
      const io = req.app.get("io");
      const room = `doctor_${doctorId}`;
      io.to(room).emit("tokenUpdated", {
        doctorId,
        slot: appointment.slot,
        slotNumber: slotLabel(slotQueue?.slotNumber),
        currentToken: slotQueue?.currentToken ?? 0,
        lastIssuedToken: slotQueue?.lastIssuedToken ?? 0,
      });

    }

    res.status(200).json({
      success: true,
      message: "Appointment completed",
      slot: appointment.slot,
      completedToken: appointment.slotTokenNumber,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    const io = req.app.get("io");
    if (io) {
      const payload = { appointmentId: appointment._id, paymentStatus: "paid" };
      io.to(`patient_${appointment.patientId}`).emit("appointmentPaid", payload);
      io.to(`doctor_${doctorId}`).emit("appointmentPaid", payload);
    }

    // notify next 2 patients in the queue that their turn is approaching
    const notifyTokens = [appointment.slotTokenNumber + 1, appointment.slotTokenNumber + 2];
    const nextPatients = await Appointment.find({
      doctorId,
      date: appointment.date,
      slot: appointment.slot,
      slotTokenNumber: { $in: notifyTokens },
      status: "waiting",
    }).populate("patientId");

    // deduplicate by FCM token so the same patient never gets 2 notifications
    const seenFcmTokens = new Set();
    for (const item of nextPatients) {
      const fcmToken = item.patientId?.fcmToken;
      if (fcmToken && item.patientId?.notificationsEnabled !== false && !seenFcmTokens.has(fcmToken)) {
        seenFcmTokens.add(fcmToken);
        const title = "Appointment Reminder";
        const body = `Current token is ${appointment.slotTokenNumber}. Your token is ${item.slotTokenNumber}. Please reach clinic soon.`;
        try {
          await admin.messaging().send({ token: fcmToken, notification: { title, body } });
        } catch (err) {
          console.log("FCM send failed:", err.message);
        }
        await Notification.create({ patientId: item.patientId._id, title, body, type: "queue_reminder", doctorId });
      }
    }

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

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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

        if (i === 0) {
          slots = slots.filter((slot) => parseTime(slot.endTime) > currentMinutes);
        }

        if (slots.length > 0) {
          next7Days.push({
            date: current.toISOString().split("T")[0],
            day: dayName,
            availableSlots: slots.map((slot) => `${slot.startTime} - ${slot.endTime}`),
          });
        }
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
      "-password -otp -otpExpiry -employees.otp -employees.otpExpiry"
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

    const paidAppointments = appointments.filter((a) => a.paymentStatus === "paid");

    const onlineRevenue = paidAppointments
      .filter((a) => a.paymentMethod === "online")
      .reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const offlineRevenue = paidAppointments
      .filter((a) => a.paymentMethod === "cash")
      .reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const completed = appointments.filter((a) => a.status === "completed").length;
    const waiting = appointments.filter((a) => a.status === "waiting").length;
    const cancelled = appointments.filter((a) => a.status === "cancelled").length;

    const paymentMode = req.user.paymentDetails?.paymentMethod;
    let revenue;
    if (paymentMode === "online") {
      revenue = { total: onlineRevenue, online: onlineRevenue };
    } else if (paymentMode === "cash") {
      revenue = { total: offlineRevenue, offline: offlineRevenue };
    } else {
      // "both" or unset
      revenue = { total: onlineRevenue + offlineRevenue, online: onlineRevenue, offline: offlineRevenue };
    }

    return res.status(200).json({
      success: true,
      date: today,
      activeStatus: req.user.activeStatus,
      doctorAvailable: req.user.doctorAvailable,
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

    // only update doctorAvailable — activeStatus is admin-controlled account status
    const doctor = await User.findByIdAndUpdate(
      doctorId,
      { doctorAvailable },
      { new: true }
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // send notification to all today's waiting patients when doctor goes ON DUTY
    if (doctorAvailable) {
      const istOffset = 5.5 * 60 * 60 * 1000;
      const today = new Date(Date.now() + istOffset).toISOString().split("T")[0];

      const allForDoctor = await Appointment.find({ doctorId }, "date status").lean();
      console.log(`[DUTY] Doctor ${doctor.name} went ON DUTY | today(IST)=${today} | all appointment dates=${JSON.stringify(allForDoctor.map(a => ({ date: a.date, status: a.status })))}`);

      const appointments = await Appointment.find({
        doctorId,
        date: today,
        status: "waiting",
      }).populate("patientId", "fcmToken fullName notificationsEnabled");

      const tokens = appointments
        .filter((a) => a.patientId?.notificationsEnabled !== false)
        .map((a) => a.patientId?.fcmToken)
        .filter(Boolean);

      console.log(`[DUTY] patients to notify=${tokens.length}`);

      const title = "Clinic is now open!";
      const body = `${doctor.name} is now attending patients. Please be ready.`;

      for (const appt of appointments) {
        if (appt.patientId?.notificationsEnabled === false) continue;
        const token = appt.patientId?.fcmToken;
        if (token) {
          try {
            await admin.messaging().send({ token, notification: { title, body } });
          } catch (err) {
            console.log(`[DUTY] FCM failed for token ${token}:`, err.message);
          }
        }
        if (appt.patientId?._id) {
          await Notification.create({ patientId: appt.patientId._id, title, body, type: "doctor_on_duty", doctorId: doctor._id });
        }
      }
    }

    // emit real-time status change to patients viewing this clinic
    const io = req.app.get("io");
    const clinicId = doctor.clinicId ? String(doctor.clinicId) : null;
    if (clinicId) {
      io.to(`clinic_${clinicId}`).emit("doctorStatusChanged", {
        doctorId: String(doctorId),
        doctorAvailable,
        name: doctor.name,
        profilePhoto: doctor.profilePhoto || "",
      });
      console.log(`[SOCKET] doctorStatusChanged emitted | clinic_${clinicId} | doctorAvailable=${doctorAvailable}`);
    }

    res.status(200).json({
      success: true,
      message: `You are now ${doctorAvailable ? "ON DUTY" : "OFF DUTY"}`,
      activeStatus: doctor.activeStatus,
      doctorAvailable: doctor.doctorAvailable,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/employees
export const getEmployees = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id).select("employees");
    const employees = doctor.employees
      .filter((e) => e.verified)
      .map((e) => ({
        name: e.name,
        phone: e.phone,
        verified: e.verified,
        accountType: e.accountType,
      }));
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/doctor/employees
export const addEmployee = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id);
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "name and phone are required" });
    }

    if (doctor.employees.length >= 2) {
      return res.status(400).json({ success: false, message: "Maximum 2 employees allowed" });
    }

    const alreadyAdded = doctor.employees.find((e) => e.phone === phone);
    if (alreadyAdded) {
      return res.status(400).json({ success: false, message: "This phone is already added as an employee" });
    }

    const conflictDoctor = await User.findOne({ phone });
    if (conflictDoctor) {
      return res.status(400).json({ success: false, message: "This number is already registered as a doctor account" });
    }

    const conflictEmployee = await User.findOne({ "employees.phone": phone });
    if (conflictEmployee) {
      return res.status(400).json({ success: false, message: "This number is already an employee of another doctor" });
    }

    const { generateOtp } = await import("../utils/generateOtp.js");
    const fixedOtp = process.env.FIXED_OTP?.trim();
    const otp = fixedOtp || generateOtp();

    doctor.employees.push({
      name,
      phone,
      otp,
      otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
      verified: false,
    });

    await doctor.save();
    console.log("Employee setup OTP:", otp);

    res.status(201).json({ success: true, message: "OTP sent to employee phone" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/doctor/employees/verify
export const verifyEmployeeOtp = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id);
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "phone and otp are required" });
    }

    const emp = doctor.employees.find((e) => e.phone === phone);
    if (!emp) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    if (String(emp.otp) !== String(otp) || emp.otpExpiry < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    emp.verified = true;
    emp.otp = null;
    emp.otpExpiry = null;
    await doctor.save();

    res.json({ success: true, message: "Employee verified successfully", employee: { name: emp.name, phone: emp.phone } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/doctor/employees/:phone
export const removeEmployee = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id);
    const { phone } = req.params;

    const index = doctor.employees.findIndex((e) => e.phone === phone);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    doctor.employees.splice(index, 1);
    await doctor.save();

    res.json({ success: true, message: "Employee removed" });
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

    const result = appointments.map((a) => {
      let estimatedTime = null;
      if (a.slot && a.slotTokenNumber) {
        const [startPart] = a.slot.split(" - ").map((s) => s.trim());
        const totalMin = parseSlotTime(startPart) + (a.slotTokenNumber - 1) * 5;
        const h = Math.floor(totalMin / 60) % 24;
        const m = totalMin % 60;
        const period = h >= 12 ? "PM" : "AM";
        const displayH = h % 12 || 12;
        estimatedTime = `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
      }
      return {
        appointmentId: a.appointmentId || a._id,
        patientName: a.fullName || a.patientId?.fullName || "",
        mobile: a.phone || a.patientId?.mobile || "",
        date: a.date,
        slot: a.slot,
        slotNumber: slotLabel(a.slotNumber),
        tokenNumber: a.slotTokenNumber,
        estimatedTime,
        consultationFee: a.consultationFee,
        paymentMethod: a.paymentMethod,
        paymentStatus: a.paymentStatus,
        isFollowup: a.isFollowup,
        completedAt: a.completedAt,
      };
    });

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

// GET /api/doctor/check-followup?mobile=<phone>&date=YYYY-MM-DD
export const checkFollowup = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { mobile, date } = req.query;

    if (!mobile) {
      return res.status(400).json({ success: false, message: "mobile is required" });
    }

    if (!date) {
      return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)" });
    }

    const appointmentDate = new Date(date);
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const doctor = await User.findById(doctorId).select("clinic name");
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const freeFollowupDays = doctor.clinic?.freeFollowupDays || 0;
    if (freeFollowupDays === 0) {
      return res.json({
        success: true,
        isFreeFollowup: false,
        reason: "This doctor has no free follow-up policy",
        consultationFee: doctor.clinic?.consultationFee ?? 0,
      });
    }

    const patient = await Patient.findOne({ mobile });
    if (!patient) {
      return res.json({
        success: true,
        isFreeFollowup: false,
        reason: "No previous visit found for this mobile number",
        consultationFee: doctor.clinic?.consultationFee ?? 0,
      });
    }

    const lastCompleted = await Appointment.findOne({
      doctorId,
      patientId: patient._id,
      status: "completed",
    }).sort({ completedAt: -1 });

    if (!lastCompleted?.completedAt) {
      return res.json({
        success: true,
        isFreeFollowup: false,
        reason: "No completed appointment found with this doctor",
        consultationFee: doctor.clinic?.consultationFee ?? 0,
      });
    }

    const daysSinceLast =
      (appointmentDate.getTime() - new Date(lastCompleted.completedAt).getTime()) / (1000 * 60 * 60 * 24);
    const isFreeFollowup = daysSinceLast >= 0 && daysSinceLast <= freeFollowupDays;
    const daysRemaining = isFreeFollowup
      ? Math.ceil(freeFollowupDays - daysSinceLast)
      : 0;

    return res.json({
      success: true,
      isFreeFollowup,
      patientName: patient.fullName || lastCompleted.fullName || "",
      mobile: patient.mobile,
      lastVisitDate: lastCompleted.completedAt,
      daysSinceLastVisit: Math.floor(daysSinceLast),
      freeFollowupDays,
      daysRemaining,
      consultationFee: isFreeFollowup ? 0 : (doctor.clinic?.consultationFee ?? 0),
      ...(!isFreeFollowup && {
        reason: `Last visit was ${Math.floor(daysSinceLast)} days ago — free follow-up window (${freeFollowupDays} days) has expired`,
      }),
    });
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

    // enforce slot capacity
    const maxPatientsPerSlot = doctor.maxPatientsPerSlot || 12;
    const existingSlotCount = await Appointment.countDocuments({
      doctorId,
      date,
      slot,
      status: { $ne: "cancelled" },
    });
    if (existingSlotCount >= maxPatientsPerSlot) {
      return res.status(400).json({ success: false, message: "This slot is fully booked. Please choose another slot." });
    }

    // deduct token before creating appointment
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
    const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "long" });
    const dayAvail = doctor.availability.find((d) => d.day === dayName && d.isActive);
    const slotIndex = dayAvail?.slots.findIndex((s) => `${s.startTime} - ${s.endTime}` === slot) ?? -1;
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
        patientId: patient._id,
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

    const paymentStatus = isFollowup
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
      patientId: patient._id,
      date,
      slot,
      slotNumber,
      tokenNumber: slotTokenNumber,
      slotTokenNumber,
      fullName,
      email: email || "",
      phone,
      problem: problem || "",
      paymentMethod,
      paymentStatus,
      consultationFee,
      isFollowup,
      status: "waiting",
    });

    // emit dashboard update to doctor's room
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
    const totalMins = effectiveBase + (slotTokenNumber - 1) * 5;
    const estHour = Math.floor(totalMins / 60) % 24;
    const estMin = totalMins % 60;
    const period = estHour >= 12 ? "PM" : "AM";
    const displayHour = estHour % 12 || 12;
    const expectedTime = `${String(displayHour).padStart(2, "0")}:${String(estMin).padStart(2, "0")} ${period}`;

    res.status(201).json({
      success: true,
      message: "Walk-in appointment created",
      slotNumber: slotLabel(slotNumber),
      tokenNumber: slotTokenNumber,
      slotTokenNumber,
      expectedTime,
      appointmentId,
      consultationFee,
      paymentStatus,
      isFollowup,
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
// PATCH /api/doctor/settings/max-patients
export const updateMaxPatientsPerSlot = async (req, res) => {
  try {
    const { maxPatientsPerSlot } = req.body;

    if (maxPatientsPerSlot == null) {
      return res.status(400).json({ success: false, message: "maxPatientsPerSlot is required" });
    }

    if (Number(maxPatientsPerSlot) < 1) {
      return res.status(400).json({ success: false, message: "maxPatientsPerSlot must be at least 1" });
    }

    const doctor = await User.findByIdAndUpdate(
      req.user._id,
      { maxPatientsPerSlot: Number(maxPatientsPerSlot) },
      { new: true, select: "maxPatientsPerSlot" }
    );

    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    res.status(200).json({
      success: true,
      message: "Max patients per slot updated",
      maxPatientsPerSlot: doctor.maxPatientsPerSlot,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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

// GET /api/doctor/step3
export const getStep3 = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id).select(
      "services availability maxPatientsPerSlot"
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    res.status(200).json({
      success: true,
      services: doctor.services || [],
      availability: doctor.availability || [],
      maxPatientsPerSlot: doctor.maxPatientsPerSlot || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/appointment-stats
export const getAppointmentStats = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const todayStr = new Date().toISOString().split("T")[0];

    const [totalBooked, completed, upcoming] = await Promise.all([
      Appointment.countDocuments({ doctorId }),
      Appointment.countDocuments({ doctorId, status: "completed" }),
      Appointment.countDocuments({
        doctorId,
        date: { $gte: todayStr },
        status: { $in: ["waiting", "in_progress"] },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalBooked,
        completed,
        upcoming,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/doctor/step3
export const updateStep3 = async (req, res) => {
  try {
    const { services, availability, maxPatientsPerSlot } = req.body;

    if (maxPatientsPerSlot !== undefined && Number(maxPatientsPerSlot) < 1) {
      return res.status(400).json({
        success: false,
        message: "Max patients per slot must be at least 1",
      });
    }

    if (availability !== undefined && !Array.isArray(availability)) {
      return res.status(400).json({
        success: false,
        message: "Availability must be an array",
      });
    }

    const doctor = await User.findById(req.user._id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    if (services !== undefined) doctor.services = services;
    if (availability !== undefined) doctor.availability = availability;
    if (maxPatientsPerSlot !== undefined) doctor.maxPatientsPerSlot = Number(maxPatientsPerSlot);

    await doctor.save();

    res.status(200).json({
      success: true,
      message: "Step 3 updated successfully",
      data: {
        services: doctor.services,
        availability: doctor.availability,
        maxPatientsPerSlot: doctor.maxPatientsPerSlot,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/token-plan
export const getTokenPlan = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id)
      .select("tokenPlan wallet")
      .populate("tokenPlan.planId", "name planType price pricePerToken validityDays");

    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const plan = doctor.tokenPlan;
    const now = new Date();
    // free tokens have no planId — check validUntil or pay_per_token pricePerToken
    const hasPlan = !!(plan?.validUntil || plan?.planType === "pay_per_token");
    const balance = doctor.wallet?.balance ?? 0;

    let isActive = false;
    let isExpired = false;
    let tokensAvailable = null;

    if (hasPlan) {
      if (plan.planType === "pay_per_token") {
        tokensAvailable = balance;
        isActive = balance >= 1;
      } else if (plan.planType === "monthly_unlimited") {
        isExpired = plan.validUntil ? plan.validUntil < now : false;
        isActive = !isExpired;
      } else {
        // free
        isExpired = plan.validUntil ? plan.validUntil < now : false;
        isActive = !isExpired && plan.usedTokens < plan.totalTokens;
        tokensAvailable = Math.max(0, plan.totalTokens - plan.usedTokens);
      }
    }

    res.status(200).json({
      success: true,
      hasPlan,
      tokenPlan: hasPlan
        ? {
            planId: plan.planId,
            planType: plan.planType,
            isUnlimited: plan.isUnlimited,
            pricePerToken: plan.pricePerToken,
            usedTokens: plan.usedTokens,
            validFrom: plan.validFrom,
            validUntil: plan.validUntil,
            isExpired,
            isActive,
            autoRenew: plan.planType === "monthly_unlimited" ? (plan.autoRenew ?? true) : undefined,
            // pay_per_token
            walletBalance: plan.planType === "pay_per_token" ? balance : undefined,
            tokensAvailable: plan.planType !== "monthly_unlimited" ? tokensAvailable : undefined,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/doctor/token-plan/auto-renew
export const toggleAutoRenew = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { autoRenew } = req.body || {};

    if (typeof autoRenew !== "boolean") {
      return res.status(400).json({ success: false, message: "autoRenew must be true or false" });
    }

    const doctor = await User.findOneAndUpdate(
      { _id: doctorId, "tokenPlan.planType": "monthly_unlimited" },
      { "tokenPlan.autoRenew": autoRenew },
      { new: true, select: "tokenPlan" }
    );

    if (!doctor) {
      return res.status(400).json({ success: false, message: "Auto-renewal is only available for monthly unlimited plans" });
    }

    res.status(200).json({
      success: true,
      message: `Auto-renewal ${autoRenew ? "enabled" : "disabled"}`,
      autoRenew: doctor.tokenPlan.autoRenew,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/wallet
export const getWallet = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id).select("wallet tokenPlan");
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const balance = doctor.wallet?.balance ?? 0;
    const ppt = doctor.tokenPlan?.pricePerToken;

    res.status(200).json({
      success: true,
      walletBalance: balance,
      pricePerToken: ppt ?? null,
      tokensAvailable: balance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/doctor/wallet/recharge
export const rechargeWallet = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { tokens } = req.body || {};

    if (!tokens || Number(tokens) <= 0 || !Number.isInteger(Number(tokens))) {
      return res.status(400).json({ success: false, message: "tokens must be a positive integer" });
    }

    const before = await User.findOne({ _id: doctorId, "tokenPlan.planType": "pay_per_token" }).select("wallet");
    if (!before) {
      return res.status(400).json({ success: false, message: "You must have an active pay_per_token plan to recharge" });
    }

    const balanceBefore = before.wallet?.balance ?? 0;

    const doctor = await User.findOneAndUpdate(
      { _id: doctorId, "tokenPlan.planType": "pay_per_token" },
      { $inc: { "wallet.balance": Number(tokens) } },
      { new: true, select: "wallet tokenPlan" }
    );

    const balance = doctor.wallet.balance;
    const ppt = doctor.tokenPlan.pricePerToken;

    await WalletTransaction.create({
      doctorId,
      type: "recharge",
      amount: Number(tokens),
      balanceBefore,
      balanceAfter: balance,
      description: `${tokens} tokens added to wallet`,
    });

    const io = req.app.get("io");
    io.to(`doctor_${doctorId}`).emit("walletUpdated", {
      walletBalance: balance,
      pricePerToken: ppt ?? null,
      tokensAvailable: balance,
    });

    res.status(200).json({
      success: true,
      message: `${tokens} tokens added to your wallet`,
      walletBalance: balance,
      tokensAvailable: balance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/plans  — doctor sees all active plans
export const getAvailablePlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ planType: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      plans: plans.map((p) => ({
        id: p._id,
        name: p.name,
        description: p.description,
        planType: p.planType,
        // monthly_unlimited
        price: p.planType === "monthly_unlimited" ? p.price : undefined,
        validityDays: p.planType === "monthly_unlimited" ? p.validityDays : undefined,
        // pay_per_token
        pricePerToken: p.planType === "pay_per_token" ? p.pricePerToken : undefined,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/doctor/plans/buy
// monthly_unlimited: { planId }
// pay_per_token:     { planId, initialAmount }  (initialAmount added to wallet)
export const buyPlan = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { planId, initialAmount } = req.body || {};

    if (!planId) return res.status(400).json({ success: false, message: "planId is required" });

    const plan = await Plan.findOne({ _id: planId, isActive: true });
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found or inactive" });

    const doctor = await User.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const now = new Date();
    const isUnlimited = plan.planType === "monthly_unlimited";
    const validUntil = isUnlimited
      ? new Date(now.getTime() + plan.validityDays * 24 * 60 * 60 * 1000)
      : null;

    doctor.tokenPlan = {
      planId: plan._id,
      planType: plan.planType,
      isUnlimited,
      validFrom: isUnlimited ? now : null,
      validUntil,
      totalTokens: 0,
      pricePerToken: plan.planType === "pay_per_token" ? plan.pricePerToken : null,
      usedTokens: 0,
      grantedAt: now,
    };

    // For pay_per_token, add initial token count to wallet
    if (plan.planType === "pay_per_token" && initialAmount && Number(initialAmount) > 0) {
      doctor.wallet = { balance: (doctor.wallet?.balance ?? 0) + Number(initialAmount) };
    }

    await doctor.save();

    const balance = doctor.wallet?.balance ?? 0;
    const ppt = doctor.tokenPlan.pricePerToken;

    const io = req.app.get("io");
    io.to(`doctor_${doctorId}`).emit("walletUpdated", {
      walletBalance: balance,
      pricePerToken: ppt ?? null,
      tokensAvailable: balance,
      planType: plan.planType,
      isUnlimited,
      validUntil: doctor.tokenPlan.validUntil,
    });

    res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" activated successfully`,
      tokenPlan: {
        planId: plan._id,
        planName: plan.name,
        planType: plan.planType,
        isUnlimited,
        pricePerToken: ppt,
        validFrom: doctor.tokenPlan.validFrom,
        validUntil: doctor.tokenPlan.validUntil,
        ...(plan.planType === "pay_per_token" && {
          walletBalance: balance,
          tokensAvailable: balance,
        }),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/reviews
export const getMyReviewsAsDoctor = async (req, res) => {
  try {
    const doctorId = req.user._id;

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

// DELETE /api/doctor/account
export const deleteDoctorAccount = async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { reason } = req.body;

    const doctor = await User.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    if (doctor.deletionRequested) {
      return res.status(400).json({
        success: false,
        message: "A deletion request is already pending admin approval",
      });
    }

    doctor.activeStatus = "inactive";
    doctor.deletionRequested = true;
    doctor.deletionReason = reason || "";
    doctor.deletionRequestedAt = new Date();
    doctor.tokenVersion += 1;
    await doctor.save();

    res.status(200).json({
      success: true,
      message: "Deletion request submitted. Your account has been deactivated pending admin review.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/wallet/history
export const getWalletHistory = async (req, res) => {
  try {
    const doctorId = req.user._id;

    const transactions = await WalletTransaction.find({ doctorId })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      transactions: transactions.map((t) => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        description: t.description,
        date: t.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/doctor/clinic
export const getMyClinic = async (req, res) => {
  try {
    const doctor = await User.findById(req.user._id).select("clinicId");
    if (!doctor?.clinicId) {
      return res.status(404).json({ success: false, message: "No clinic found" });
    }

    const clinic = await Clinic.findById(doctor.clinicId);
    if (!clinic) return res.status(404).json({ success: false, message: "Clinic not found" });

    const doctors = await User.find(
      { clinicId: doctor.clinicId, role: "doctor", status: "approved" },
      "name profilePhoto services experience doctorAvailable activeStatus"
    );

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
        profilePhoto: d.profilePhoto,
        services: d.services,
        experience: d.experience,
        doctorAvailable: d.doctorAvailable,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/doctor/clinic/add-doctor  body: { phone }
export const addDoctorToClinic = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("clinicId");

    if (!me?.clinicId) {
      return res.status(400).json({ success: false, message: "You don't have a clinic yet" });
    }

    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "phone is required" });

    const target = await User.findOne({ phone, role: "doctor" });

    if (!target) {
      return res.status(404).json({ success: false, message: "No doctor found with this phone number" });
    }

    if (target._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You are already in this clinic" });
    }

    if (target.status !== "approved") {
      return res.status(400).json({ success: false, message: "Doctor is not approved yet" });
    }

    if (target.clinicId && target.clinicId.toString() !== me.clinicId.toString()) {
      return res.status(400).json({ success: false, message: "Doctor already belongs to another clinic" });
    }

    target.clinicId = me.clinicId;
    await target.save();

    res.status(200).json({
      success: true,
      message: `${target.name} added to your clinic`,
      doctor: { id: target._id, name: target.name, phone: target.phone },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/doctor/clinic/remove-doctor/:doctorId
export const removeDoctorFromClinic = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("clinicId");

    if (!me?.clinicId) {
      return res.status(400).json({ success: false, message: "You don't have a clinic" });
    }

    const { doctorId } = req.params;

    if (doctorId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You cannot remove yourself" });
    }

    const target = await User.findOne({
      _id: doctorId,
      role: "doctor",
      clinicId: me.clinicId,
    });

    if (!target) {
      return res.status(404).json({ success: false, message: "Doctor not found in your clinic" });
    }

    target.clinicId = null;
    await target.save();

    res.status(200).json({ success: true, message: `${target.name} removed from clinic` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelAppointment = async (req, res) => {
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

    const refund = await refundToken(doctorId);
    if (refund?.walletBalance !== undefined) {
      const io = req.app.get("io");
      io.to(`doctor_${doctorId}`).emit("walletUpdated", {
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
