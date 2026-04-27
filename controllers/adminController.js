import User from "../models/User.js";
import Appointment from "../models/appointment.model.js";
import AppVersion from "../models/appVersion.model.js";
import Report from "../models/report.model.js";
import LegalContent from "../models/legalContent.model.js";
import { sendApprovalEmail, sendRejectionEmail } from "../utils/sendEmail.js";

//get pending users

export const getPendingUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 10;
        const skip = (page - 1) * limit;

        const total = await User.countDocuments({ status: "pending" });

        const users = await User.find({ status: "pending" })
            .select("-password")
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            users,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 10;
        const skip = (page - 1) * limit;

        const total = await User.countDocuments({
            status: "approved",
            role: { $ne: "admin" },
        });

        const users = await User.find({
            status: "approved",
            role: { $ne: "admin" },
        })
            .select("-password")
            .skip(skip)
            .limit(limit);

        const doctorIds = users.map((u) => u._id);

        const appointmentCounts = await Appointment.aggregate([
            { $match: { doctorId: { $in: doctorIds } } },
            { $group: { _id: "$doctorId", total: { $sum: 1 } } },
        ]);

        const countMap = {};
        appointmentCounts.forEach((a) => {
            countMap[a._id.toString()] = a.total;
        });

        const usersWithCounts = users.map((u) => ({
            ...u.toObject(),
            totalAppointments: countMap[u._id.toString()] || 0,
        }));

        res.json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            users: usersWithCounts,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const approveUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    user.status = "approved";
    user.activeStatus = "active";
    await user.save();

    //send approval email
    await sendApprovalEmail(user.email);

    res.json({
        success: true,
        message: "User approved, activated & email sent",
    });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const rejectUser = async (req, res) => {
  try {
    const { rejections } = req.body;

    console.log("Received rejections:", rejections); // 🔥 debug log

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!rejections || rejections.length === 0) {
      return res.status(400).json({
        message: "Rejections data required",
      });
    }

    // ✅ Validate steps
    const validSteps = [1, 2, 3, 4, 5];
    const invalidSteps = rejections.filter(r => !validSteps.includes(r.step));
    if (invalidSteps.length > 0) {
      return res.status(400).json({
        message: `Invalid steps: ${invalidSteps.map(r => r.step).join(", ")}`,
      });
    }

    // ✅ Save rejections
    user.rejections = rejections;
    user.status = "rejected";

    // ✅ Find earliest step and move user back
    const steps = rejections.map(r => r.step);
    const minStep = Math.min(...steps);
    user.registrationStep = minStep - 1;

    await user.save();

    // ✅ Send rejection email
    const combinedReason = rejections
      .map(r => `Step ${r.step}: ${r.reason}`)
      .join("\n");

    await sendRejectionEmail(user.email, combinedReason);

    res.json({
      success: true,
      message: "User rejected with step corrections",
      rejections: user.rejections,
      redirectToStep: minStep,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


export const toggleDoctorActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { activeStatus } = req.body;

    if (!["active", "inactive"].includes(activeStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status. Use 'active' or 'inactive'" });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    if (user.status !== "approved") {
      return res.status(400).json({ success: false, message: "Only approved doctors can be toggled" });
    }

    user.activeStatus = activeStatus;
    await user.save();

    res.json({
      success: true,
      message: `Doctor marked as ${activeStatus}`,
      activeStatus: user.activeStatus,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE single doctor
export const deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
 
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "Doctor not found" });
 
    // delete doctor + all their appointments
    await Appointment.deleteMany({ doctorId: id });
    await User.findByIdAndDelete(id);
 
    res.json({ success: true, message: "Doctor and their appointments deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
 
// DELETE multiple doctors
export const deleteDoctors = async (req, res) => {
  try {
    const { ids } = req.body;
 
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "ids array is required" });
 
    // delete all their appointments first
    await Appointment.deleteMany({ doctorId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
 
    res.json({ success: true, message: `${ids.length} doctor(s) deleted successfully`, deletedCount: ids.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/app-version — create (first-time setup for a platform)
export const setAppVersion = async (req, res) => {
  try {
    const { appType, platform, latestVersion, minVersion, forceUpdate, storeUrl, releaseNotes } = req.body;

    if (!appType || !platform || !latestVersion || !minVersion) {
      return res.status(400).json({
        success: false,
        message: "appType, platform, latestVersion and minVersion are required",
      });
    }

    const version = await AppVersion.findOneAndUpdate(
      { appType, platform },
      { latestVersion, minVersion, forceUpdate, storeUrl, releaseNotes },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({ success: true, message: "App version saved", version });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/admin/app-version/:appType/:platform — update existing version (used by admin panel)
export const updateAppVersion = async (req, res) => {
  try {
    const { appType, platform } = req.params;
    const { latestVersion, minVersion, forceUpdate, storeUrl, releaseNotes } = req.body;

    const version = await AppVersion.findOneAndUpdate(
      { appType, platform },
      { latestVersion, minVersion, forceUpdate, storeUrl, releaseNotes },
      { new: true, runValidators: true }
    );

    if (!version) {
      return res.status(404).json({
        success: false,
        message: `No version found for ${appType}/${platform}. Create it first via POST /api/admin/app-version`,
      });
    }

    res.status(200).json({ success: true, message: "App version updated", version });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/app-version — list all versions
export const getAppVersions = async (req, res) => {
  try {
    const versions = await AppVersion.find().sort({ appType: 1, platform: 1 });
    res.status(200).json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/app-version/:appType/:platform — public, called by mobile apps
export const checkAppVersion = async (req, res) => {
  try {
    const { appType, platform } = req.params;

    const version = await AppVersion.findOne({ appType, platform });

    if (!version) {
      return res.status(404).json({ success: false, message: "Version info not found" });
    }

    res.status(200).json({
      success: true,
      appType: version.appType,
      platform: version.platform,
      latestVersion: version.latestVersion,
      minVersion: version.minVersion,
      forceUpdate: version.forceUpdate,
      storeUrl: version.storeUrl,
      releaseNotes: version.releaseNotes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/reports — all reports from all doctors
export const getAllReports = async (req, res) => {
  try {
    const { status, priority, category } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const reports = await Report.find(filter)
      .populate("doctorId", "name phone")
      .sort({ createdAt: -1 });

    const formatted = reports.map((r) => ({
      ticketId: r.ticketId,
      userName: r.doctorId?.name || "",
      phone: r.doctorId?.phone || "",
      subject: r.subject,
      category: r.category,
      priority: r.priority,
      status: r.status,
      description: r.description,
      createdAt: r.createdAt,
    }));

    res.status(200).json({ success: true, total: formatted.length, reports: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/admin/legal/:type — set terms or privacy policy
export const setLegalContent = async (req, res) => {
  try {
    const { type } = req.params;
    const { content } = req.body;

    const validTypes = ["terms_doctor", "terms_patient", "privacy_policy"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(", ")}` });
    }

    const doc = await LegalContent.findOneAndUpdate(
      { type },
      { content },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: "Saved successfully", data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/legal/:type — public, read by mobile app
export const getLegalContent = async (req, res) => {
  try {
    const { type } = req.params;

    const validTypes = ["terms_doctor", "terms_patient", "privacy_policy"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(", ")}` });
    }

    const doc = await LegalContent.findOne({ type });

    res.status(200).json({
      success: true,
      type,
      content: doc?.content || "",
      updatedAt: doc?.updatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/appointments — all appointments with filters
export const getAllAppointments = async (req, res) => {
  try {
    const { status, paymentStatus, doctorName, page = 1 } = req.query;
    const limit = 20;
    const skip = (Math.max(1, parseInt(page)) - 1) * limit;

    // if filtering by doctor name, find matching doctor IDs first
    let doctorIdFilter = null;
    if (doctorName) {
      const doctors = await User.find({
        name: { $regex: doctorName, $options: "i" },
      }).select("_id");
      doctorIdFilter = doctors.map((d) => d._id);
    }

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (doctorIdFilter) query.doctorId = { $in: doctorIdFilter };

    const total = await Appointment.countDocuments(query);

    const appointments = await Appointment.find(query)
      .populate("doctorId", "name clinic")
      .populate("patientId", "fullName mobile")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const result = appointments.map((a) => ({
      id: a._id,
      patient: {
        name: a.fullName || a.patientId?.fullName || "",
        mobile: a.phone || a.patientId?.mobile || "",
      },
      doctor: {
        id: a.doctorId?._id || "",
        name: a.doctorId?.name || "",
      },
      clinic: {
        name: a.doctorId?.clinic?.clinicName || "",
      },
      date: a.date,
      slot: a.slot,
      tokenNumber: a.tokenNumber,
      status: a.status,
      paymentMethod: a.paymentMethod,
      paymentStatus: a.paymentStatus,
      consultationFee: a.consultationFee,
      isFollowup: a.isFollowup,
      createdAt: a.createdAt,
    }));

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      appointments: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/admin/reports/:ticketId/status — open or close a ticket
export const updateReportStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    if (!["open", "closed"].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'open' or 'closed'" });
    }

    const report = await Report.findOneAndUpdate(
      { ticketId },
      { status },
      { new: true }
    ).populate("doctorId", "name");

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    res.status(200).json({
      success: true,
      message: `Ticket ${ticketId} marked as ${status}`,
      report: {
        ticketId: report.ticketId,
        userName: report.doctorId?.name || "",
        subject: report.subject,
        category: report.category,
        priority: report.priority,
        status: report.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
