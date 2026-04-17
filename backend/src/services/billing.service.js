const { DateTime } = require("luxon");
const mongoose = require("mongoose");
const { Buyer, updateBuyerById } = require("../models/buyers");
const { MilkTransaction } = require("../models/milk");
const { Payment, getSettlementPayments } = require("../models/payments");
const { User } = require("../models/users");
const { createBuyerBill, findBillByBuyerAndPeriodKey } = require("../models/buyerBills");

const TZ = "Asia/Kolkata";

function buyerSaleQuery(userId, mobile) {
  const uid = new mongoose.Types.ObjectId(userId);
  const or = [{ buyerId: uid }];
  if (mobile && String(mobile).trim()) {
    or.push({ buyerPhone: String(mobile).trim() });
  }
  return { type: "sale", $or: or };
}

async function getLatestSettlementCutoff(mobile) {
  if (!mobile || !String(mobile).trim()) return null;
  const list = await getSettlementPayments({
    customerMobile: String(mobile).trim(),
    paymentDirection: "from_buyer",
  });
  if (!list || list.length === 0) return null;
  let latest = null;
  for (const p of list) {
    const d = p.paymentDate ? new Date(p.paymentDate) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

function accountingStartIST(buyerCreatedAt, settlementCutoff) {
  const createdStart = DateTime.fromJSDate(buyerCreatedAt, { zone: "utc" })
    .setZone(TZ)
    .startOf("day");
  if (!settlementCutoff) return createdStart;
  const settle = DateTime.fromJSDate(settlementCutoff, { zone: "utc" }).setZone(TZ);
  return settle > createdStart ? settle : createdStart;
}

function clampDayInMonth(year, month, dayOfMonth) {
  const last = DateTime.fromObject({ year, month, day: 1 }, { zone: TZ }).endOf("month").day;
  return Math.min(Math.max(1, dayOfMonth), last);
}

/** End of billing calendar day in IST (23:59:59.999) */
function endOfBillingDayIST(year, month, day) {
  return DateTime.fromObject({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, { zone: TZ });
}

/** DB + legacy: explicit mode or infer custom from billingDayOfMonth only */
function resolveBillingMode(buyer) {
  const m = buyer.billingMode;
  if (m === "daily" || m === "month_end" || m === "custom") return m;
  if (typeof buyer.billingDayOfMonth === "number" && buyer.billingDayOfMonth >= 1 && buyer.billingDayOfMonth <= 31) {
    return "custom";
  }
  return null;
}

async function sumMilkAndCash(userId, mobile, fromIncl, toIncl) {
  const q = { ...buyerSaleQuery(userId, mobile), date: { $gte: fromIncl, $lte: toIncl } };
  const txs = await MilkTransaction.find(q).lean();
  let quantity = 0;
  let amount = 0;
  let cashReceived = 0;
  for (const tx of txs) {
    quantity += Number(tx.quantity) || 0;
    const ta = Number(tx.totalAmount) || 0;
    amount += ta;
    if (tx.paymentType === "cash" && tx.amountReceived != null) {
      const ar = Number(tx.amountReceived) || 0;
      cashReceived += Math.min(ar, ta);
    }
  }
  return { quantity, amount, cashReceived };
}

async function sumPaymentsFromBuyer(userId, mobile, fromIncl, toIncl) {
  const uid = new mongoose.Types.ObjectId(userId);
  const m = String(mobile || "").trim();
  const rows = await Payment.find({
    isSettlement: { $ne: true },
    paymentDate: { $gte: fromIncl, $lte: toIncl },
    $and: [
      { $or: [{ paymentDirection: "from_buyer" }, { paymentDirection: { $exists: false } }] },
      { $or: [{ customerId: uid }, { customerMobile: m }] },
    ],
  }).lean();

  let total = 0;
  for (const p of rows) {
    if (p.paymentDirection === "to_seller") continue;
    total += Number(p.amount) || 0;
  }
  return total;
}

async function paymentsInCycleTotal(userId, mobile, fromIncl, toIncl) {
  const { cashReceived } = await sumMilkAndCash(userId, mobile, fromIncl, toIncl);
  const standalone = await sumPaymentsFromBuyer(userId, mobile, fromIncl, toIncl);
  return cashReceived + standalone;
}

async function previousBalanceAt(userId, mobile, periodStart, accountingStart) {
  const from = accountingStart.toJSDate();
  const to = DateTime.fromJSDate(periodStart, { zone: "utc" })
    .setZone(TZ)
    .minus({ milliseconds: 1 })
    .toJSDate();
  if (to < from) return 0;
  const milk = await sumMilkAndCash(userId, mobile, from, to);
  const paid = await paymentsInCycleTotal(userId, mobile, from, to);
  return Math.round((milk.amount - paid) * 100) / 100;
}

/**
 * Generate bill for one buyer for the given billing close instant (typically today 23:59 IST).
 * @param {string} buyerId
 * @param {Date} [now] - reference time (default: now)
 */
async function generateBillForBuyer(buyerId, now = new Date()) {
  const buyer = await Buyer.findById(buyerId);
  if (!buyer || buyer.active === false) return { skipped: true, reason: "buyer_missing_or_inactive" };

  const mode = resolveBillingMode(buyer);
  if (!mode) return { skipped: true, reason: "no_billing_config" };

  const userId = buyer.userId.toString();
  const user = await User.findById(buyer.userId);
  const mobile = user?.mobile ? String(user.mobile).trim() : "";

  const istNow = DateTime.fromJSDate(now, { zone: "utc" }).setZone(TZ);
  let periodEnd;
  let billingPeriodKey;

  if (mode === "daily") {
    periodEnd = istNow.endOf("day").toJSDate();
    billingPeriodKey = istNow.toFormat("yyyy-MM-dd");
  } else if (mode === "month_end") {
    const lastDom = istNow.endOf("month").day;
    if (istNow.day !== lastDom) {
      return { skipped: true, reason: "not_month_end" };
    }
    periodEnd = istNow.endOf("day").toJSDate();
    billingPeriodKey = istNow.toFormat("yyyy-MM-dd");
  } else {
    const day = buyer.billingDayOfMonth;
    if (!(typeof day === "number" && day >= 1 && day <= 31)) {
      return { skipped: true, reason: "no_billing_day" };
    }
    const y = istNow.year;
    const mo = istNow.month;
    const d = clampDayInMonth(y, mo, day);
    if (istNow.day !== d) {
      return { skipped: true, reason: "not_billing_day" };
    }
    periodEnd = endOfBillingDayIST(y, mo, d).toJSDate();
    billingPeriodKey = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const existing = await findBillByBuyerAndPeriodKey(buyer._id, billingPeriodKey);
  if (existing) {
    return { skipped: true, reason: "already_billed", bill: existing };
  }

  const settlementCutoff = await getLatestSettlementCutoff(mobile);
  const acctStart = accountingStartIST(buyer.createdAt, settlementCutoff);

  let periodStart;
  if (buyer.lastBillingPeriodEnd) {
    periodStart = DateTime.fromJSDate(buyer.lastBillingPeriodEnd, { zone: "utc" })
      .setZone(TZ)
      .plus({ days: 1 })
      .startOf("day")
      .toJSDate();
  } else {
    periodStart = acctStart.toJSDate();
  }

  if (periodStart > periodEnd) {
    return { skipped: true, reason: "invalid_period" };
  }

  const prev = await previousBalanceAt(userId, mobile, periodStart, acctStart);
  const cycle = await sumMilkAndCash(userId, mobile, periodStart, periodEnd);
  const paidInCycle = await paymentsInCycleTotal(userId, mobile, periodStart, periodEnd);
  const totalDue = Math.round((prev + cycle.amount - paidInCycle) * 100) / 100;

  const bill = await createBuyerBill({
    buyerId: buyer._id,
    userId: buyer.userId,
    billingPeriodKey,
    periodStart,
    periodEnd,
    previousBalance: prev,
    cycleMilkQuantity: Math.round(cycle.quantity * 1000) / 1000,
    cycleMilkAmount: Math.round(cycle.amount * 100) / 100,
    paymentsInCycle: Math.round(paidInCycle * 100) / 100,
    totalDue,
  });

  await updateBuyerById(buyer._id, { lastBillingPeriodEnd: periodEnd });

  return { skipped: false, bill };
}

async function runBillingForAllBuyersDue(now = new Date()) {
  const buyers = await Buyer.find({
    active: true,
    $or: [
      { billingMode: "daily" },
      { billingMode: "month_end" },
      { billingMode: "custom" },
      { billingDayOfMonth: { $gte: 1, $lte: 31 } },
    ],
  }).lean();

  const results = [];
  for (const b of buyers) {
    const r = await generateBillForBuyer(b._id.toString(), now);
    results.push({ buyerId: b._id.toString(), ...r });
  }
  return results;
}

module.exports = {
  generateBillForBuyer,
  runBillingForAllBuyersDue,
  resolveBillingMode,
  TZ,
};
