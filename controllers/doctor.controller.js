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