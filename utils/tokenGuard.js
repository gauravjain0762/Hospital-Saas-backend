import User from "../models/User.js";

export const checkAndDeductToken = async (doctorId) => {
  const now = new Date();

  // Unlimited plan: just check validity, still track usage
  const unlimited = await User.findOneAndUpdate(
    {
      _id: doctorId,
      "tokenPlan.isUnlimited": true,
      "tokenPlan.validUntil": { $gte: now },
    },
    { $inc: { "tokenPlan.usedTokens": 1 } },
    { new: true, select: "tokenPlan" }
  );

  if (unlimited) {
    return { allowed: true, remainingTokens: null };
  }

  // Limited plan (free / token_pack): check validity AND tokens remaining
  const limited = await User.findOneAndUpdate(
    {
      _id: doctorId,
      "tokenPlan.isUnlimited": { $ne: true },
      "tokenPlan.validUntil": { $gte: now },
      $expr: { $lt: ["$tokenPlan.usedTokens", "$tokenPlan.totalTokens"] },
    },
    { $inc: { "tokenPlan.usedTokens": 1 } },
    { new: true, select: "tokenPlan" }
  );

  if (limited) {
    const plan = limited.tokenPlan;
    return {
      allowed: true,
      remainingTokens: plan.totalTokens - plan.usedTokens,
    };
  }

  // Failed — diagnose reason
  const doctor = await User.findById(doctorId).select("tokenPlan");
  const plan = doctor?.tokenPlan;

  if (!plan?.validUntil) {
    return { allowed: false, reason: "No token plan assigned. Please contact admin." };
  }

  if (now > plan.validUntil) {
    return { allowed: false, reason: "Your token plan has expired. Please contact admin." };
  }

  if (!plan.isUnlimited && plan.usedTokens >= plan.totalTokens) {
    return { allowed: false, reason: "All tokens exhausted. Please contact admin for a new plan." };
  }

  return { allowed: false, reason: "Token plan is not active." };
};
