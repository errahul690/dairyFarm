const mongoose = require("mongoose");

/**
 * BuyerMonthlySummary
 * One document per buyer per monthKey (YYYY-MM).
 * Settlement is ignored: opening/closing are purely derived from lifetime milk/payments.
 */
const BuyerMonthlySummarySchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "Buyer", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    buyerMobile: { type: String, required: true, trim: true, index: true },
    monthKey: { type: String, required: true, trim: true }, // YYYY-MM

    openingBalance: { type: Number, required: true, default: 0 },
    milkIn: { type: Number, required: true, default: 0 }, // milk sales amount in this month
    paymentsOut: { type: Number, required: true, default: 0 }, // payments received in this month
    closingBalance: { type: Number, required: true, default: 0 },

    lastRebuiltAt: { type: Date, required: false, default: undefined },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toJSON: {
      transform(_doc, ret) {
        ret._id = ret._id.toString();
        ret.buyerId = ret.buyerId.toString();
        ret.userId = ret.userId.toString();
        return ret;
      },
    },
  }
);

BuyerMonthlySummarySchema.index({ buyerId: 1, monthKey: 1 }, { unique: true });

const BuyerMonthlySummary = mongoose.model("BuyerMonthlySummary", BuyerMonthlySummarySchema);

async function upsertBuyerMonthlySummary(buyerId, monthKey, data) {
  const update = {
    buyerId,
    userId: data.userId,
    buyerMobile: String(data.buyerMobile || "").trim(),
    monthKey,
    openingBalance: Math.round((Number(data.openingBalance) || 0) * 100) / 100,
    milkIn: Math.round((Number(data.milkIn) || 0) * 100) / 100,
    paymentsOut: Math.round((Number(data.paymentsOut) || 0) * 100) / 100,
    closingBalance: Math.round((Number(data.closingBalance) || 0) * 100) / 100,
    lastRebuiltAt: new Date(),
  };
  return BuyerMonthlySummary.findOneAndUpdate(
    { buyerId, monthKey },
    { $set: update },
    { new: true, upsert: true }
  ).lean();
}

async function listMonthlySummariesForBuyer(buyerId, limit = 24) {
  return BuyerMonthlySummary.find({ buyerId })
    .sort({ monthKey: -1 })
    .limit(Math.min(120, Math.max(1, limit)))
    .lean();
}

async function listMonthlySummariesByMonthKey(userId, monthKey, limit = 5000) {
  return BuyerMonthlySummary.find({ userId, monthKey: String(monthKey || "").trim() })
    .limit(Math.min(10000, Math.max(1, limit)))
    .lean();
}

module.exports = {
  BuyerMonthlySummary,
  upsertBuyerMonthlySummary,
  listMonthlySummariesForBuyer,
  listMonthlySummariesByMonthKey,
};

