import User from "../models/User.js";
import { sendApprovalEmail, sendRejectionEmail } from "../utils/sendEmail.js";

//get pending users

export const getPendingUsers = async (req, res) => {
    try {
        const users = await User.find({ status: "pending" }).select("-password");

        res.json({
            success: true,
            users,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({
            status: "approved",
            role: { $ne: "admin" },
        }).select("-password");

        res.json({
            success: true,
            users,
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
    // [{ step: 2, reason: "..." }, { step: 4, reason: "..." }]

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!rejections || rejections.length === 0) {
      return res.status(400).json({
        message: "Rejections data required",
      });
    }

    // ✅ Save rejections
    user.rejections = rejections;
    user.status = "rejected";

    // ✅ Find earliest step
    const steps = rejections.map(r => r.step);
    const minStep = Math.min(...steps);

    // 🔥 Move user back
    user.registrationStep = minStep - 1;

    await user.save();

    // OPTIONAL: send email with combined reasons
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