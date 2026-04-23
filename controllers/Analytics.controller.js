import Appointment from "../models/appointment.model.js";
import moment from "moment";

// Helper: get date range based on filter
const getDateRange = (filter, customStart, customEnd) => {
  const today = moment().startOf("day");

  switch (filter) {
    case "today":
      return {
        start: today.clone().toDate(),
        end: today.clone().endOf("day").toDate(),
        dateStrings: [today.format("YYYY-MM-DD")],
      };

    case "yesterday": {
      const yesterday = today.clone().subtract(1, "day");
      return {
        start: yesterday.toDate(),
        end: yesterday.clone().endOf("day").toDate(),
        dateStrings: [yesterday.format("YYYY-MM-DD")],
      };
    }

    case "7days": {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push(today.clone().subtract(i, "day").format("YYYY-MM-DD"));
      }
      return {
        start: today.clone().subtract(6, "days").toDate(),
        end: today.clone().endOf("day").toDate(),
        dateStrings: days,
      };
    }

    case "custom": {
      if (!customStart || !customEnd) {
        throw new Error("customStart and customEnd are required for custom filter");
      }
      const start = moment(customStart).startOf("day");
      const end = moment(customEnd).endOf("day");

      const days = [];
      let curr = start.clone();
      while (curr.isSameOrBefore(end, "day")) {
        days.push(curr.format("YYYY-MM-DD"));
        curr.add(1, "day");
      }

      return {
        start: start.toDate(),
        end: end.toDate(),
        dateStrings: days,
      };
    }

    default:
      throw new Error("Invalid filter. Use: today, yesterday, 7days, custom");
  }
};

// GET /api/admin/analytics/doctor/:doctorId
export const getDoctorAnalytics = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { filter = "today", customStart, customEnd } = req.query;

    const { dateStrings } = getDateRange(filter, customStart, customEnd);

    // Fetch all appointments for this doctor in the date range
    const appointments = await Appointment.find({
      doctorId,
      date: { $in: dateStrings },
    });

    // ── 1. TOTAL APPOINTMENTS ──────────────────────────────────────────
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(
      (a) => a.status === "completed"
    ).length;
    const cancelledAppointments = appointments.filter(
      (a) => a.status === "cancelled"
    ).length;
    const waitingAppointments = appointments.filter(
      (a) => a.status === "waiting"
    ).length;

    // ── 2. TOTAL PAYMENTS ──────────────────────────────────────────────
    const paidAppointments = appointments.filter(
      (a) => a.paymentStatus === "paid"
    );

    const onlinePayments = paidAppointments.filter(
      (a) => a.paymentMethod === "online"
    );
    const cashPayments = paidAppointments.filter(
      (a) => a.paymentMethod === "cash"
    );

    const totalOnlineAmount = onlinePayments.reduce(
      (sum, a) => sum + (a.consultationFee || 0),
      0
    );
    const totalCashAmount = cashPayments.reduce(
      (sum, a) => sum + (a.consultationFee || 0),
      0
    );
    const totalRevenue = totalOnlineAmount + totalCashAmount;

    // ── 3. FOLLOWUP vs NEW PATIENTS ────────────────────────────────────
    const followupCount = appointments.filter((a) => a.isFollowup).length;
    const newPatientCount = appointments.filter((a) => !a.isFollowup).length;

    // ── 4. PRICING MODEL (from doctor profile) ─────────────────────────
    // Imported dynamically to avoid circular dependency issues
    const { default: User } = await import("../models/User.js");
    const doctor = await User.findById(doctorId).select(
      "clinic.consultationFee subscriptionPlan name"
    );

    const consultationFee = doctor?.clinic?.consultationFee || 0;
    const subscriptionPlan = doctor?.subscriptionPlan || null;

    // ── 5. RESPONSE ────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      filter,
      ...(filter === "custom" && { customStart, customEnd }),
      data: {
        appointments: {
          total: totalAppointments,
          completed: completedAppointments,
          cancelled: cancelledAppointments,
          waiting: waitingAppointments,
        },
        payments: {
          totalRevenue,
          online: {
            count: onlinePayments.length,
            amount: totalOnlineAmount,
          },
          cash: {
            count: cashPayments.length,
            amount: totalCashAmount,
          },
        },
        patients: {
          newPatients: newPatientCount,
          followups: followupCount,
        },
        pricingModel: {
          consultationFee,
          subscriptionPlan,
        },
      },
    });
  } catch (error) {
    console.error("getDoctorAnalytics error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
