import Queue from "../models/queue.model.js";
import Appointment from "../models/appointment.model.js";
import User from "../models/User.js";
import admin from "../utils/firebase.js";

export const getTodayQueue = async (req, res) => {
  try {
    const doctorId = req.user._id;

    const today = new Date().toISOString().split("T")[0];

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

    io.to(`doctor_${doctorId}`).emit("tokenUpdated", {
      doctorId,
      currentToken: queue.currentToken,
      lastIssuedToken: queue.lastIssuedToken,
    });

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

    // forward only logic
    if (appointment.tokenNumber >= queue.currentToken) {
      queue.currentToken = appointment.tokenNumber;
    }

    // find next waiting token greater than current
    const nextWaiting = await Appointment.findOne({
      doctorId,
      date: appointment.date,
      tokenNumber: { $gt: queue.currentToken },
      status: "waiting",
    }).sort({ tokenNumber: 1 });

    if (nextWaiting) {
      queue.currentToken = nextWaiting.tokenNumber;
    }

    await queue.save();

    // socket emit
    const io = req.app.get("io");

    io.to(`doctor_${doctorId}`).emit("tokenUpdated", {
      doctorId,
      currentToken: queue.currentToken,
      lastIssuedToken: queue.lastIssuedToken,
    });

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

    const totalAppointments = appointments.length;

    const revenue = appointments
      .filter((a) => a.paymentStatus === "paid")
      .reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const completed = appointments.filter((a) => a.status === "completed").length;
    const waiting = appointments.filter((a) => a.status === "waiting").length;
    const cancelled = appointments.filter((a) => a.status === "cancelled").length;

    return res.status(200).json({
      success: true,
      date: today,
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