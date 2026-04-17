import Queue from "../models/queue.model.js";
import Appointment from "../models/appointment.model.js";

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

    const appointments = await Appointment.find({
      doctorId,
      date: today,
      status: "waiting",
    })
      .populate("patientId", "fullName mobile profilePhoto")
      .sort({ tokenNumber: 1 });

    res.status(200).json({
      success: true,
      date: today,
      currentToken: queue.currentToken,
      lastIssuedToken: queue.lastIssuedToken,
      waitingCount: appointments.length,
      appointments,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};