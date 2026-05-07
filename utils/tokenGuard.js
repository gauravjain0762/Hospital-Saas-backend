import User from "../models/User.js";

export const checkAndDeductToken = async (doctorId) => {
  const now = new Date();

  // Case 1: monthly_unlimited — check validity, track usage
  const unlimited = await User.findOneAndUpdate(
    {
      _id: doctorId,
      "tokenPlan.isUnlimited": true,
      "tokenPlan.validUntil": { $gte: now },
    },
    { $inc: { "tokenPlan.usedTokens": 1 } },
    { new: true, select: "tokenPlan" }
  );
  if (unlimited) return { allowed: true, remainingTokens: null };

  // Case 2: pay_per_token — read pricePerToken then atomically deduct from wallet
  const doctorSnap = await User.findOne(
    { _id: doctorId, "tokenPlan.planType": "pay_per_token" },
    { "tokenPlan.pricePerToken": 1 }
  );
  if (doctorSnap) {
    const ppt = doctorSnap.tokenPlan.pricePerToken;
    const walletPay = await User.findOneAndUpdate(
      {
        _id: doctorId,
        "tokenPlan.planType": "pay_per_token",
        "wallet.balance": { $gte: ppt },
      },
      { $inc: { "wallet.balance": -ppt, "tokenPlan.usedTokens": 1 } },
      { new: true, select: "wallet tokenPlan" }
    );
    if (walletPay) {
      return {
        allowed: true,
        walletBalance: walletPay.wallet.balance,
        tokensAvailable: Math.floor(walletPay.wallet.balance / ppt),
      };
    }
    // plan exists but balance was insufficient
    const balance = (await User.findById(doctorId).select("wallet")).wallet?.balance ?? 0;
    return {
      allowed: false,
      reason: `Insufficient wallet balance. Current balance: ₹${balance}. Please recharge your wallet.`,
    };
  }

  // Case 3: free — check validity AND tokens remaining
  const free = await User.findOneAndUpdate(
    {
      _id: doctorId,
      "tokenPlan.planType": "free",
      "tokenPlan.validUntil": { $gte: now },
      $expr: { $lt: ["$tokenPlan.usedTokens", "$tokenPlan.totalTokens"] },
    },
    { $inc: { "tokenPlan.usedTokens": 1 } },
    { new: true, select: "tokenPlan" }
  );
  if (free) {
    const plan = free.tokenPlan;
    return { allowed: true, remainingTokens: plan.totalTokens - plan.usedTokens };
  }

  // All failed — diagnose reason (only free/monthly reach here)
  const doctor = await User.findById(doctorId).select("tokenPlan");
  const plan = doctor?.tokenPlan;

  if (!plan?.planType || (plan.planType === "free" && !plan.validUntil)) {
    return { allowed: false, reason: "No token plan assigned. Please contact admin or purchase a plan." };
  }

  if (plan.planType === "monthly_unlimited") {
    return { allowed: false, reason: "Your monthly plan has expired. Please renew." };
  }

  if (plan.planType === "free") {
    if (plan.validUntil && now > plan.validUntil) {
      return { allowed: false, reason: "Your free token plan has expired. Please purchase a plan." };
    }
    if (plan.usedTokens >= plan.totalTokens) {
      return { allowed: false, reason: "All free tokens exhausted. Please purchase a plan." };
    }
  }

  return { allowed: false, reason: "Token plan is not active." };
};
