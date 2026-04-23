import User from "../models/User.js";
import Appointment from "../models/appointment.model.js";
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