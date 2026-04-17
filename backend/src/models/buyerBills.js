const mongoose = require("mongoose");

const BuyerBillSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** YYYY-MM-DD in Asia/Kolkata for the billing close date (period ends this calendar day 23:59 IST) */
    billingPeriodKey: {
      type: String,
      required: true,
      trim: true,
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    /** Outstanding before this cycle (after settlement / since last bill) */
    previousBalance: { type: Number, required: true },
    cycleMilkQuantity: { type: Number, required: true },
    cycleMilkAmount: { type: Number, required: true },
    /** Cash on milk sales + payment records in [periodStart, periodEnd] */
    paymentsInCycle: { type: Number, required: true },
    /** previousBalance + cycleMilkAmount - paymentsInCycle */
    totalDue: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toJSON: {
      transform(doc, ret) {
        ret._id = ret._id.toString();
        ret.buyerId = ret.buyerId.toString();
        ret.userId = ret.userId.toString();
        return ret;
      },
    },
  }
);

BuyerBillSchema.index({ buyerId: 1, billingPeriodKey: 1 }, { unique: true });
BuyerBillSchema.index({ userId: 1, createdAt: -1 });

const BuyerBill = mongoose.model("BuyerBill", BuyerBillSchema);

async function createBuyerBill(data) {
  const doc = new BuyerBill(data);
  return doc.save();
}

async function findBillByBuyerAndPeriodKey(buyerId, billingPeriodKey) {
  return BuyerBill.findOne({ buyerId, billingPeriodKey });
}

async function listBillsForBuyer(buyerId, limit = 24) {
  return BuyerBill.find({ buyerId })
    .sort({ periodEnd: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();
}

module.exports = {
  BuyerBill,
  createBuyerBill,
  findBillByBuyerAndPeriodKey,
  listBillsForBuyer,
};
