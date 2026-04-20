const mongoose = require("mongoose");

/**
 * BuyerBalance
 * Stored, buyer-wise running totals so UI doesn't need to recompute.
 * Settlement is intentionally ignored (per product decision): pending = lifetime milk sales - lifetime payments.
 */
const BuyerBalanceSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "Buyer", required: true, index: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    buyerMobile: { type: String, required: true, trim: true, index: true },
    buyerName: { type: String, required: false, trim: true },

    totalMilkAmount: { type: Number, required: true, default: 0 },
    totalPaidAmount: { type: Number, required: true, default: 0 },
    pendingAmount: { type: Number, required: true, default: 0 },

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

const BuyerBalance = mongoose.model("BuyerBalance", BuyerBalanceSchema);

async function upsertBuyerBalance({ buyerId, userId, buyerMobile, buyerName, totalMilkAmount, totalPaidAmount }) {
  const milk = Number(totalMilkAmount) || 0;
  const paid = Number(totalPaidAmount) || 0;
  const pending = Math.round((milk - paid) * 100) / 100;
  const update = {
    buyerId,
    userId,
    buyerMobile: String(buyerMobile || "").trim(),
    buyerName: buyerName || undefined,
    totalMilkAmount: Math.round(milk * 100) / 100,
    totalPaidAmount: Math.round(paid * 100) / 100,
    pendingAmount: pending,
    lastRebuiltAt: new Date(),
  };
  return BuyerBalance.findOneAndUpdate({ buyerId }, { $set: update }, { new: true, upsert: true }).lean();
}

async function getBuyerBalanceByBuyerId(buyerId) {
  return BuyerBalance.findOne({ buyerId }).lean();
}

async function listBuyerBalances(filter = {}) {
  return BuyerBalance.find(filter).sort({ pendingAmount: -1, updatedAt: -1 }).lean();
}

module.exports = {
  BuyerBalance,
  upsertBuyerBalance,
  getBuyerBalanceByBuyerId,
  listBuyerBalances,
};

