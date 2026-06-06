const { MilkTransaction } = require("../models/milk");
const { Payment } = require("../models/payments");
const { Buyer, findBuyerByUserId } = require("../models/buyers");
const { User } = require("../models/users");
const { upsertBuyerBalance } = require("../models/buyerBalances");
const {
  BuyerMonthlySummary,
  upsertBuyerMonthlySummary,
  listMonthlySummariesForBuyer,
} = require("../models/buyerMonthlySummaries");
const { monthKeyFromDate, monthRangeFromKey } = require("../utils/istMonth");

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

async function loadBuyerSalesAndPayments(buyer) {
  const user = await User.findById(buyer.userId);
  const mobile = (user?.mobile || "").trim();
  const mobile10 = normalizeMobile10(mobile);
  if (!mobile) return { mobile, mobile10, sales: [], payments: [] };

  const phoneQuery = mobile10 ? { $regex: `${mobile10}$` } : mobile;
  const [sales, payments] = await Promise.all([
    MilkTransaction.find({ type: "sale", buyerPhone: phoneQuery }).sort({ date: 1 }).lean(),
    Payment.find({
      isSettlement: { $ne: true },
      paymentDirection: { $ne: "to_seller" },
      customerMobile: phoneQuery,
    })
      .sort({ paymentDate: 1 })
      .lean(),
  ]);
  return { mobile, mobile10, sales: sales || [], payments: payments || [] };
}

/**
 * Rebuild buyer balance + monthly summaries from source-of-truth collections.
 * Settlement is intentionally ignored: pending = lifetime milk sales - lifetime payments.
 */
async function rebuildBuyerBalanceAndMonthly(buyerId) {
  if (!buyerId) return null;
  const buyer = await resolveBuyerFromId(buyerId);
  if (!buyer) return null;

  const { mobile, sales, payments } = await loadBuyerSalesAndPayments(buyer);
  if (!mobile) return null;
  const user = await User.findById(buyer.userId);

  const totalMilkAmount = sales.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
  const totalPaidAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceDoc = await upsertBuyerBalance({
    buyerId: buyer._id,
    userId: buyer.userId,
    buyerMobile: mobile,
    buyerName: buyer.name || user?.name,
    totalMilkAmount,
    totalPaidAmount,
  });

  const byMonth = new Map();
  sales.forEach((t) => {
    const mk = monthKeyFromDate(t.date);
    if (!mk) return;
    if (!byMonth.has(mk)) byMonth.set(mk, { milkIn: 0, paymentsOut: 0 });
    byMonth.get(mk).milkIn += Number(t.totalAmount) || 0;
  });
  payments.forEach((p) => {
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

/** Rebuild buyers that have no summary row for the given month (admin monthly view). */
async function ensureMonthlySummariesForMonth(monthKey, buyerIds) {
  const mk = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mk) || !Array.isArray(buyerIds) || buyerIds.length === 0) return;

  const existing = await BuyerMonthlySummary.find({ monthKey: mk, buyerId: { $in: buyerIds } })
    .select("buyerId")
    .lean();
  const have = new Set((existing || []).map((r) => String(r.buyerId)));
  const missing = buyerIds.filter((id) => !have.has(String(id)));
  for (const id of missing) {
    await rebuildBuyerBalanceAndMonthly(id);
  }
}

/**
 * Month ledger for admin/buyer UI: stored summary + entries for one month only.
 * Rebuilds summaries if the buyer has never been computed.
 */
async function getBuyerMonthLedger(buyerId, monthKey) {
  const mk = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) return null;

  const buyer = await resolveBuyerFromId(buyerId);
  if (!buyer) return null;

  let summaries = await listMonthlySummariesForBuyer(buyer._id, 120);
  if (!Array.isArray(summaries) || summaries.length === 0) {
    await rebuildBuyerBalanceAndMonthly(buyer._id);
    summaries = await listMonthlySummariesForBuyer(buyer._id, 120);
  }

  let summary = (summaries || []).find((s) => s.monthKey === mk) || null;
  if (!summary) {
    await rebuildBuyerBalanceAndMonthly(buyer._id);
    summaries = await listMonthlySummariesForBuyer(buyer._id, 120);
    summary = (summaries || []).find((s) => s.monthKey === mk) || null;
  }

  const emptySummary = {
    monthKey: mk,
    openingBalance: 0,
    milkIn: 0,
    paymentsOut: 0,
    closingBalance: 0,
  };

  const { mobile10 } = await loadBuyerSalesAndPayments(buyer);
  const phoneQuery = mobile10 ? { $regex: `${mobile10}$` } : null;
  const range = monthRangeFromKey(mk);

  let milkEntries = [];
  let paymentEntries = [];
  if (phoneQuery && range) {
    [milkEntries, paymentEntries] = await Promise.all([
      MilkTransaction.find({
        type: "sale",
        buyerPhone: phoneQuery,
        date: { $gte: range.from, $lt: range.to },
      })
        .sort({ date: -1 })
        .lean(),
      Payment.find({
        isSettlement: { $ne: true },
        paymentDirection: { $ne: "to_seller" },
        customerMobile: phoneQuery,
        paymentDate: { $gte: range.from, $lt: range.to },
      })
        .sort({ paymentDate: -1 })
        .lean(),
    ]);
  }

  const computedMilk = (milkEntries || []).reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
  const computedPay = (paymentEntries || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const storedMilk = Number(summary?.milkIn) || 0;
  const storedPay = Number(summary?.paymentsOut) || 0;
  if (
    !summary ||
    Math.abs(computedMilk - storedMilk) > 0.01 ||
    Math.abs(computedPay - storedPay) > 0.01
  ) {
    await rebuildBuyerBalanceAndMonthly(buyer._id);
    summaries = await listMonthlySummariesForBuyer(buyer._id, 120);
    summary = (summaries || []).find((s) => s.monthKey === mk) || null;
  }

  const monthKeys = (summaries || []).map((s) => s.monthKey).sort((a, b) => b.localeCompare(a));

  const entries = [
    ...(milkEntries || []).map((t) => ({
      kind: "milk",
      _id: t._id?.toString?.() || String(t._id),
      date: t.date,
      amount: Number(t.totalAmount) || 0,
      quantity: Number(t.quantity) || 0,
      pricePerLiter: Number(t.pricePerLiter) || 0,
      milkSource: t.milkSource,
      paymentType: t.paymentType,
      notes: t.notes,
      buyer: t.buyer,
      buyerPhone: t.buyerPhone,
    })),
    ...(paymentEntries || []).map((p) => ({
      kind: "payment",
      _id: p._id?.toString?.() || String(p._id),
      date: p.paymentDate,
      amount: Number(p.amount) || 0,
      paymentType: p.paymentType,
      notes: p.notes,
      customerMobile: p.customerMobile,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    buyerId: buyer._id.toString(),
    monthKey: mk,
    summary: summary || emptySummary,
    monthKeys,
    summaries: summaries || [],
    entries,
  };
}

module.exports = {
  rebuildBuyerBalanceAndMonthly,
  ensureMonthlySummariesForMonth,
  getBuyerMonthLedger,
  monthKeyFromDate,
};
