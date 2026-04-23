const { MilkTransaction } = require("../models/milk");
const { Payment } = require("../models/payments");
const { Buyer, findBuyerByUserId } = require("../models/buyers");
const { User } = require("../models/users");
const { upsertBuyerBalance } = require("../models/buyerBalances");
const { upsertBuyerMonthlySummary } = require("../models/buyerMonthlySummaries");

function monthKeyFromDate(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeMobile10(mobile) {
  const raw = String(mobile || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * MilkTransaction.buyerId is historically the consumer User _id (see milk model).
 * Some callers may pass Buyer _id. Resolve either way so rebuild always runs.
 */
async function resolveBuyerFromId(buyerIdOrUserId) {
  if (!buyerIdOrUserId) return null;
  let buyer = await Buyer.findById(buyerIdOrUserId);
  if (buyer) return buyer;
  const user = await User.findById(buyerIdOrUserId);
  if (!user) return null;
  return findBuyerByUserId(user._id);
}

/**
 * Rebuild buyer balance + monthly summaries from source-of-truth collections.
 * Settlement is intentionally ignored: pending = lifetime milk sales - lifetime payments.
 */
async function rebuildBuyerBalanceAndMonthly(buyerId) {
  if (!buyerId) return null;
  const buyer = await resolveBuyerFromId(buyerId);
  if (!buyer) return null;
  const user = await User.findById(buyer.userId);
  const mobile = (user?.mobile || "").trim();
  const mobile10 = normalizeMobile10(mobile);
  if (!mobile) return null;

  const [sales, payments] = await Promise.all([
    MilkTransaction.find({
      type: "sale",
      // buyerPhone is usually 10-digit; but keep a resilient suffix match to handle any formatting drift.
      buyerPhone: mobile10 ? { $regex: `${mobile10}$` } : mobile,
    })
      .sort({ date: 1 })
      .lean(),
    Payment.find({
      isSettlement: { $ne: true },
      paymentDirection: { $ne: "to_seller" },
      // customerMobile may be stored as +91..., so match by last 10 digits.
      customerMobile: mobile10 ? { $regex: `${mobile10}$` } : mobile,
    })
      .sort({ paymentDate: 1 })
      .lean(),
  ]);

  const totalMilkAmount = (sales || []).reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
  const totalPaidAmount = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceDoc = await upsertBuyerBalance({
    buyerId: buyer._id,
    userId: buyer.userId,
    buyerMobile: mobile,
    buyerName: buyer.name || user?.name,
    totalMilkAmount,
    totalPaidAmount,
  });

  // Month-wise summaries (ascending)
  const byMonth = new Map(); // monthKey -> { milkIn, paymentsOut }
  (sales || []).forEach((t) => {
    const mk = monthKeyFromDate(t.date);
    if (!mk) return;
    if (!byMonth.has(mk)) byMonth.set(mk, { milkIn: 0, paymentsOut: 0 });
    byMonth.get(mk).milkIn += Number(t.totalAmount) || 0;
  });
  (payments || []).forEach((p) => {
    const mk = monthKeyFromDate(p.paymentDate);
    if (!mk) return;
    if (!byMonth.has(mk)) byMonth.set(mk, { milkIn: 0, paymentsOut: 0 });
    byMonth.get(mk).paymentsOut += Number(p.amount) || 0;
  });

  const monthKeys = Array.from(byMonth.keys()).sort((a, b) => a.localeCompare(b));
  let running = 0;
  for (const mk of monthKeys) {
    const row = byMonth.get(mk) || { milkIn: 0, paymentsOut: 0 };
    const openingBalance = running;
    const closingBalance = openingBalance + (Number(row.milkIn) || 0) - (Number(row.paymentsOut) || 0);
    await upsertBuyerMonthlySummary(buyer._id, mk, {
      userId: buyer.userId,
      buyerMobile: mobile,
      openingBalance,
      milkIn: row.milkIn,
      paymentsOut: row.paymentsOut,
      closingBalance,
    });
    running = closingBalance;
  }

  return balanceDoc;
}

module.exports = {
  rebuildBuyerBalanceAndMonthly,
};

