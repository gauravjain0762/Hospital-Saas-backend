import User from "../models/User.js";
import Appointment from "../models/appointment.model.js";
import Patient from "../models/patient.model.js";
import AppVersion from "../models/appVersion.model.js";
import Report from "../models/report.model.js";
import LegalContent from "../models/legalContent.model.js";
import PatientReport from "../models/patientReport.model.js";
import Plan from "../models/plan.model.js";
import { sendApprovalEmail, sendRejectionEmail } from "../utils/sendEmail.js";
import { formatLegalContent } from "../utils/formatLegalContent.js";
import DeletedDoctorLog from "../models/deletedDoctorLog.model.js";

//get pending users

export const getPendingUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 10;
        const skip = (page - 1) * limit;

        const total = await User.countDocuments({ status: "pending" });

        const users = await User.find({ status: "pending" })
            .select("-password -otp -otpExpiry -employees.otp -employees.otpExpiry")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const usersWithClinic = users.map((u) => ({
            ...u.toObject(),
            clinicId: u.clinicId ?? null,
        }));

        res.json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            users: usersWithClinic,
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
            .select("-password -otp -otpExpiry -employees.otp -employees.otpExpiry")
            .sort({ createdAt: -1 })
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
            clinicId: u.clinicId ?? null,
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

    res.json({
        success: true,
        message: "User approved, activated & email sent",
    });

    sendApprovalEmail(user.email).catch(err =>
        console.error("[EMAIL] Approval email failed:", err.message)
    );
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

    const combinedReason = rejections
      .map(r => `Step ${r.step}: ${r.reason}`)
      .join("\n");

    res.json({
      success: true,
      message: "User rejected with step corrections",
      rejections: user.rejections,
      redirectToStep: minStep,
    });

    sendRejectionEmail(user.email, combinedReason).catch(err =>
      console.error("[EMAIL] Rejection email failed:", err.message)
    );

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

    if (activeStatus === "inactive") {
      // expire doctor's own session
      await User.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } });

      // expire sessions of all patients who had appointments with this doctor
      const patientIds = await Appointment.distinct("patientId", { doctorId: id });
      if (patientIds.length > 0) {
        await Patient.updateMany(
          { _id: { $in: patientIds } },
          { $inc: { tokenVersion: 1 } }
        );
      }
    }

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
 
    // invalidate tokens of all patients who had appointments with this doctor
    const patientIds = await Appointment.distinct("patientId", { doctorId: id });
    if (patientIds.length > 0) {
      await Patient.updateMany(
        { _id: { $in: patientIds } },
        { $inc: { tokenVersion: 1 } }
      );
    }

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
    // invalidate tokens of all patients who had appointments with these doctors
    const patientIds = await Appointment.distinct("patientId", { doctorId: { $in: ids } });
    if (patientIds.length > 0) {
      await Patient.updateMany(
        { _id: { $in: patientIds } },
        { $inc: { tokenVersion: 1 } }
      );
    }

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
      userType: "doctor",
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

// GET /api/admin/patient-reports
export const getAllPatientReports = async (req, res) => {
  try {
    const { status, priority, category } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const reports = await PatientReport.find(filter)
      .populate("patientId", "fullName mobile")
      .sort({ createdAt: -1 });

    const formatted = reports.map((r) => ({
      ticketId: r.ticketId,
      userType: "patient",
      patientName: r.patientId?.fullName || r.patientName || "",
      mobile: r.patientId?.mobile || r.mobile || "",
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

// PATCH /api/admin/patient-reports/:ticketId/status
export const updatePatientReportStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    if (!["open", "closed"].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'open' or 'closed'" });
    }

    const report = await PatientReport.findOneAndUpdate(
      { ticketId },
      { status },
      { new: true }
    ).populate("patientId", "fullName");

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    res.status(200).json({
      success: true,
      message: `Ticket ${ticketId} marked as ${status}`,
      report: {
        ticketId: report.ticketId,
        patientName: report.patientId?.fullName || "",
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

// PATCH /api/admin/legal/:type — set terms or privacy policy
export const setLegalContent = async (req, res) => {
  try {
    const { type } = req.params;
    const { content } = req.body;

    const validTypes = ["terms_doctor", "terms_patient", "privacy_policy_doctor", "privacy_policy_patient"];
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

    const validTypes = ["terms_doctor", "terms_patient", "privacy_policy_doctor", "privacy_policy_patient"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(", ")}` });
    }

    const doc = await LegalContent.findOne({ type });
    const content = formatLegalContent(doc?.content || "");

    res.status(200).json({
      success: true,
      type,
      content,
      updatedAt: doc?.updatedAt || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/payments/summary
export const getPaymentsSummary = async (req, res) => {
  try {
    const totalBookings = await Appointment.countDocuments();

    const revenueResult = await Appointment.aggregate([
      { $match: { status: "completed", paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$consultationFee" } } },
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;

    res.status(200).json({ success: true, totalRevenue, totalBookings });
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

// POST /api/admin/doctors/:id/grant-tokens
export const grantTokens = async (req, res) => {
  try {
    const { id } = req.params;
    const { tokens, days } = req.body;

    if (!tokens || !days || Number(tokens) < 1 || Number(days) < 1) {
      return res.status(400).json({ success: false, message: "tokens and days are required and must be at least 1" });
    }

    const doctor = await User.findOne({ _id: id, role: "doctor" });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const now = new Date();
    const validUntil = new Date(now.getTime() + Number(days) * 24 * 60 * 60 * 1000);

    doctor.tokenPlan = {
      totalTokens: Number(tokens),
      usedTokens: 0,
      validFrom: now,
      validUntil,
      planType: "free",
      grantedAt: now,
    };

    await doctor.save();

    res.status(200).json({
      success: true,
      message: `${tokens} free tokens granted to Dr. ${doctor.name} for ${days} day(s)`,
      tokenPlan: {
        planType: doctor.tokenPlan.planType,
        totalTokens: doctor.tokenPlan.totalTokens,
        usedTokens: doctor.tokenPlan.usedTokens,
        remainingTokens: doctor.tokenPlan.totalTokens,
        validFrom: doctor.tokenPlan.validFrom,
        validUntil: doctor.tokenPlan.validUntil,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/doctors/:id/token-plan
export const getDoctorTokenPlan = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await User.findOne({ _id: id, role: "doctor" }).select("name tokenPlan").populate("tokenPlan.planId", "name planType price validityDays");
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const plan = doctor.tokenPlan;
    const now = new Date();
    const hasPlan = !!plan?.validUntil;
    const isExpired = hasPlan && plan.validUntil < now;
    const remaining = plan?.isUnlimited ? null : (hasPlan ? Math.max(0, plan.totalTokens - plan.usedTokens) : 0);
    const isActive = hasPlan && !isExpired && (plan.isUnlimited || remaining > 0);

    res.status(200).json({
      success: true,
      doctor: { id: doctor._id, name: doctor.name },
      hasPlan,
      tokenPlan: hasPlan
        ? {
            planId: plan.planId,
            planType: plan.planType,
            isUnlimited: plan.isUnlimited,
            totalTokens: plan.isUnlimited ? null : plan.totalTokens,
            usedTokens: plan.usedTokens,
            remainingTokens: remaining,
            validFrom: plan.validFrom,
            validUntil: plan.validUntil,
            pricePaid: plan.pricePaid,
            isExpired,
            isActive,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PLAN CRUD ────────────────────────────────────────────────────────────────

// POST /api/admin/plans
export const createPlan = async (req, res) => {
  try {
    const { name, description, planType, price, pricePerToken, validityDays } = req.body;

    if (!name || !planType) {
      return res.status(400).json({ success: false, message: "name and planType are required" });
    }

    if (!["monthly_unlimited", "pay_per_token"].includes(planType)) {
      return res.status(400).json({ success: false, message: "planType must be monthly_unlimited or pay_per_token" });
    }

    if (planType === "monthly_unlimited" && (price == null || !validityDays)) {
      return res.status(400).json({ success: false, message: "price and validityDays are required for monthly_unlimited" });
    }

    if (planType === "pay_per_token" && (pricePerToken == null || Number(pricePerToken) < 1)) {
      return res.status(400).json({ success: false, message: "pricePerToken is required for pay_per_token plans" });
    }

    const plan = await Plan.create({
      name,
      description: description || "",
      planType,
      price: planType === "monthly_unlimited" ? Number(price) : null,
      pricePerToken: planType === "pay_per_token" ? Number(pricePerToken) : null,
      // null validityDays = tokens never expire (pay_per_token only)
      validityDays: validityDays != null ? Number(validityDays) : null,
    });

    res.status(201).json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/plans
export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/admin/plans/:id
export const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, pricePerToken, validityDays, isActive } = req.body;

    const plan = await Plan.findById(id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

    if (name !== undefined) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (isActive !== undefined) plan.isActive = isActive;
    if (validityDays !== undefined) plan.validityDays = validityDays != null ? Number(validityDays) : null;
    if (price !== undefined && plan.planType === "monthly_unlimited") plan.price = Number(price);
    if (pricePerToken !== undefined && plan.planType === "pay_per_token") plan.pricePerToken = Number(pricePerToken);

    await plan.save();
    res.status(200).json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/admin/plans/:id
export const deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await Plan.findById(id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

    plan.isActive = false;
    await plan.save();

    res.status(200).json({ success: true, message: "Plan deactivated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/doctors/:id/assign-plan
// monthly_unlimited: { planId }
// pay_per_token:     { planId }  — doctor recharges wallet separately
export const assignPlanToDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { planId } = req.body;

    if (!planId) return res.status(400).json({ success: false, message: "planId is required" });

    const [doctor, plan] = await Promise.all([
      User.findOne({ _id: id, role: "doctor" }),
      Plan.findById(planId),
    ]);

    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });
    if (!plan || !plan.isActive) return res.status(404).json({ success: false, message: "Plan not found or inactive" });

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

    await doctor.save();

    res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" assigned to Dr. ${doctor.name}`,
      tokenPlan: {
        planId: plan._id,
        planName: plan.name,
        planType: plan.planType,
        isUnlimited,
        pricePerToken: doctor.tokenPlan.pricePerToken,
        validFrom: doctor.tokenPlan.validFrom,
        validUntil: doctor.tokenPlan.validUntil,
        walletBalance: doctor.wallet?.balance ?? 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/doctors/:id/wallet/add  — admin manually tops up a doctor's wallet
export const adminAddWalletBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "amount must be greater than 0" });
    }

    const doctor = await User.findOneAndUpdate(
      { _id: id, role: "doctor" },
      { $inc: { "wallet.balance": Number(amount) } },
      { new: true, select: "name wallet tokenPlan" }
    );

    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found" });

    const balance = doctor.wallet.balance;
    const ppt = doctor.tokenPlan?.pricePerToken;

    res.status(200).json({
      success: true,
      message: `₹${amount} added to Dr. ${doctor.name}'s wallet`,
      walletBalance: balance,
      tokensAvailable: ppt ? Math.floor(balance / ppt) : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/dashboard/stats
export const getDashboardStats = async (req, res) => {
  try {
    const [totalPatients, totalAppointments] = await Promise.all([
      Patient.countDocuments(),
      Appointment.countDocuments(),
    ]);

    res.json({
      success: true,
      totalPatients,
      totalAppointments,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/plans/assigned  — all doctors with an active plan
export const getAllAssignedPlans = async (req, res) => {
  try {
    const doctors = await User.find({
      role: "doctor",
      "tokenPlan.planId": { $ne: null },
    })
      .select("name phone email tokenPlan wallet")
      .populate("tokenPlan.planId", "name planType price pricePerToken");

    const now = new Date();

    const data = doctors.map((d) => {
      const plan = d.tokenPlan;
      const isExpired = plan.isUnlimited && plan.validUntil ? plan.validUntil < now : false;
      const balance = d.wallet?.balance ?? 0;
      return {
        doctorId: d._id,
        name: d.name,
        phone: d.phone,
        email: d.email,
        plan: {
          planId: plan.planId,
          planType: plan.planType,
          isUnlimited: plan.isUnlimited,
          pricePerToken: plan.pricePerToken,
          usedTokens: plan.usedTokens,
          validFrom: plan.validFrom,
          validUntil: plan.validUntil,
          isExpired,
          isActive: plan.planType === "pay_per_token" ? balance > 0 : !isExpired,
        },
        walletBalance: balance,
        tokensAvailable: plan.pricePerToken ? Math.floor(balance / plan.pricePerToken) : null,
      };
    });

    res.status(200).json({ success: true, total: data.length, doctors: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

export const getDeletedDoctors = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const total = await DeletedDoctorLog.countDocuments();
    const records = await DeletedDoctorLog.find()
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      doctors: records.map((r) => ({
        doctorId: r.doctorId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        clinic: r.clinic,
        reason: r.reason,
        deletedAt: r.deletedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/deletion-requests
export const getDeletionRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const total = await User.countDocuments({ deletionRequested: true });
    const doctors = await User.find({ deletionRequested: true })
      .select("name email phone clinic deletionReason deletionRequestedAt")
      .sort({ deletionRequestedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      doctors: doctors.map((d) => ({
        id: d._id,
        name: d.name || "",
        email: d.email || "",
        phone: d.phone || "",
        clinic: {
          clinicName: d.clinic?.clinicName || "",
          address: d.clinic?.address || "",
          city: d.clinic?.city || "",
          state: d.clinic?.state || "",
        },
        reason: d.deletionReason || "",
        requestedAt: d.deletionRequestedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/deletion-requests/:id/approve
export const approveDeletion = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await User.findOne({ _id: id, deletionRequested: true });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Deletion request not found" });
    }

    await DeletedDoctorLog.create({
      doctorId: doctor._id,
      name: doctor.name || "",
      email: doctor.email || "",
      phone: doctor.phone || "",
      clinic: {
        clinicName: doctor.clinic?.clinicName || "",
        address: doctor.clinic?.address || "",
        city: doctor.clinic?.city || "",
        state: doctor.clinic?.state || "",
      },
      reason: doctor.deletionReason || "",
    });

    const patientIds = await Appointment.distinct("patientId", { doctorId: id });
    if (patientIds.length > 0) {
      await Patient.updateMany(
        { _id: { $in: patientIds } },
        { $inc: { tokenVersion: 1 } }
      );
    }

    await Appointment.deleteMany({ doctorId: id });
    await User.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Doctor account deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/deletion-requests/:id/reject
export const rejectDeletion = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await User.findOne({ _id: id, deletionRequested: true });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Deletion request not found" });
    }

    doctor.deletionRequested = false;
    doctor.deletionReason = "";
    doctor.deletionRequestedAt = null;
    doctor.activeStatus = "active";
    await doctor.save();

    res.status(200).json({
      success: true,
      message: "Deletion request rejected. Doctor account has been reactivated.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


