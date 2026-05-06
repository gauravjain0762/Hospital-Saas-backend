import User from "../models/User.js";

export const checkAndDeductToken = async (doctorId) => {
  // Single atomic operation: only succeeds if plan is valid AND tokens remain.
  // Using $expr prevents a TOCTOU race when two appointments are booked simultaneously.
  const updated = await User.findOneAndUpdate(
    {
      _id: doctorId,
      "tokenPlan.validUntil": { $gte: new Date() },
      $expr: { $lt: ["$tokenPlan.usedTokens", "$tokenPlan.totalTokens"] },
    },
    { $inc: { "tokenPlan.usedTokens": 1 } },
    { new: true, select: "tokenPlan" }
  );

  if (updated) {
    const plan = updated.tokenPlan;
    return {
      allowed: true,
      remainingTokens: plan.totalTokens - plan.usedTokens,
    };
  }

  // Deduction failed — read current state to give a meaningful error message.
  const doctor = await User.findById(doctorId).select("tokenPlan");
  const plan = doctor?.tokenPlan;

  if (!plan?.validUntil) {
    return { allowed: false, reason: "No token plan assigned. Please contact admin." };
  }

  if (new Date() > plan.validUntil) {
    return { allowed: false, reason: "Your free token plan has expired. Please upgrade to premium." };
  }

  if (plan.usedTokens >= plan.totalTokens) {
    return { allowed: false, reason: "All free tokens exhausted. Please upgrade to premium." };
  }

  return { allowed: false, reason: "Token plan is not active." };
};
