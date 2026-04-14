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
    await user.save();

    //send approval email
    await sendApprovalEmail(user.email);

    res.json({
        success: true,
        message: "User approved & email sent",
    });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const rejectUser = async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        //send rejection email
        await sendRejectionEmail(user.email, reason);

        //delete user
        await User.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: "User rejected & email sent",
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