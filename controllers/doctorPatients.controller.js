import Appointment from "../models/appointment.model.js";
import moment from "moment";

const getDateStrings = (filter, customStart, customEnd) => {
  const today = moment().startOf("day");

  switch (filter) {
    case "today":
      return [today.format("YYYY-MM-DD")];

    case "yesterday":
      return [today.clone().subtract(1, "day").format("YYYY-MM-DD")];

    case "7days": {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push(today.clone().subtract(i, "day").format("YYYY-MM-DD"));
      }
      return days;
    }

    case "custom": {
      if (!customStart || !customEnd)
        throw new Error("customStart and customEnd are required");

      const start = moment(customStart).startOf("day");
      const end = moment(customEnd).endOf("day");
      const days = [];
      let curr = start.clone();
      while (curr.isSameOrBefore(end, "day")) {
        days.push(curr.format("YYYY-MM-DD"));
        curr.add(1, "day");
      }
      return days;
    }

    default:
      throw new Error("Invalid filter");
  }
};

// GET /api/admin/analytics/doctor/:doctorId/patients
export const getDoctorPatients = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { filter = "today", customStart, customEnd } = req.query;

    const dateStrings = getDateStrings(filter, customStart, customEnd);

    const appointments = await Appointment.find({
      doctorId,
      date: { $in: dateStrings },
    }).sort({ createdAt: -1 });

    const patients = appointments.map((a) => ({
      appointmentId: a._id,
      fullName: a.fullName || "Unknown",
      phone: a.phone || "N/A",
      date: a.date,
      slot: a.slot,
      tokenNumber: a.tokenNumber,
      paymentMethod: a.paymentMethod,
      paymentStatus: a.paymentStatus,
      consultationFee: a.consultationFee,
      isFollowup: a.isFollowup,
      status: a.status,
    }));

    return res.status(200).json({
      success: true,
      filter,
      total: patients.length,
      patients,
    });
  } catch (error) {
    console.error("getDoctorPatients error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};