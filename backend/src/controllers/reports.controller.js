const { MilkTransaction } = require("../models/milk");
const { CharaPurchase } = require("../models/chara");
const { User, UserRoles } = require("../models/users");
const XLSX = require("xlsx");
const PDFDocument = require("pdfkit-table");

const TREND_PERIOD_LABELS = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly"
};

const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const trendLabelFormatters = {
  weekly: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: IST_TIMEZONE }),
  monthly: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: IST_TIMEZONE }),
  yearly: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: IST_TIMEZONE })
};

/**
 * Return [start,end] for an IST calendar day as UTC instants.
 * This avoids "day shift" bugs when server runs in UTC.
 */
function getIstDayRange(reference = new Date()) {
  const ist = new Date(reference.getTime() + IST_OFFSET_MS);
  const startMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}

function normalizeBuyerMobile(mobile) {
  if (mobile == null || mobile === "" || mobile === "undefined" || mobile === "null") {
    return null;
  }
  const trimmed = String(mobile).trim();
  return trimmed ? trimmed : null;
}

function createDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatMetadataDate(date, unit) {
  if (unit === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return createDateKey(date);
}

function getTrendConfig(period, todayRange) {
  const normalizedPeriod = TREND_PERIOD_LABELS[period] ? period : "weekly";
  const label = TREND_PERIOD_LABELS[normalizedPeriod];
  const end = todayRange.end;
  if (normalizedPeriod === "monthly") {
    const start = new Date(todayRange.start);
    start.setUTCDate(start.getUTCDate() - 29);
    return {
      period: normalizedPeriod,
      label,
      unit: "day",
      length: 30,
      start,
      end,
      formatter: trendLabelFormatters.monthly
    };
  }

  if (normalizedPeriod === "yearly") {
    // Start from current IST month (as UTC instant), then go back 11 months.
    const istEnd = new Date(end.getTime() + IST_OFFSET_MS);
    const currentIstMonthStartMs =
      Date.UTC(istEnd.getUTCFullYear(), istEnd.getUTCMonth(), 1) - IST_OFFSET_MS;
    const start = new Date(currentIstMonthStartMs);
    start.setUTCMonth(start.getUTCMonth() - 11);
    return {
      period: normalizedPeriod,
      label,
      unit: "month",
      length: 12,
      start,
      end,
      formatter: trendLabelFormatters.yearly
    };
  }

  const start = new Date(todayRange.start);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    period: normalizedPeriod,
    label,
    unit: "day",
    length: 7,
    start,
    end,
    formatter: trendLabelFormatters.weekly
  };
}

function getMonthRange(year, month, upToToday = false) {
  const normalizedYear =
    Number.isFinite(Number(year)) && Number(year) > 0
      ? Number(year)
      : new Date().getUTCFullYear();
  const normalizedMonth =
    Number.isFinite(Number(month)) && Number(month) >= 1 && Number(month) <= 12
      ? Number(month)
      : new Date().getUTCMonth() + 1;
  const start = new Date(Date.UTC(normalizedYear, normalizedMonth - 1, 1));
  let end;
  const now = new Date();
  const isCurrentMonth = normalizedYear === now.getUTCFullYear() && normalizedMonth === now.getUTCMonth() + 1;
  if (upToToday && isCurrentMonth) {
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  } else {
    end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  }
  return {
    year: normalizedYear,
    month: normalizedMonth,
    start,
    end
  };
}

function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function getBuyerFilterStages(buyerMobile) {
  if (!buyerMobile) {
    return [];
  }
  return [
    {
      $addFields: {
        normalizedBuyerPhone: {
          $trim: {
            input: { $ifNull: ["$buyerPhone", ""] }
          }
        }
      }
    },
    {
      $match: {
        normalizedBuyerPhone: buyerMobile
      }
    }
  ];
}

function buildTrendSeries(rawTrend, { start, length, unit, formatter }) {
  const rawTrendMap = new Map(rawTrend.map((entry) => [entry._id, entry]));
  const series = [];
  for (let i = 0; i < length; i += 1) {
    const current = new Date(start);
    if (unit === "month") {
      current.setUTCMonth(current.getUTCMonth() + i);
    } else {
      current.setUTCDate(current.getUTCDate() + i);
    }
    const key =
      unit === "month"
        ? `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}`
        : createDateKey(current);
    const rawEntry = rawTrendMap.get(key);
    const totalQuantity = Number(rawEntry?.totalQuantity ?? 0);
    const totalAmount = Number(rawEntry?.totalAmount ?? 0);
    series.push({
      date: key,
      label: formatter.format(current),
      totalQuantity,
      totalAmount
    });
  }
  return series;
}

async function aggregateTrendData({ start, end, unit, buyerMobile }) {
  const format = unit === "month" ? "%Y-%m" : "%Y-%m-%d";
  const pipeline = [
    {
      $match: {
        type: "sale",
        date: { $gte: start, $lte: end }
      }
    },
    ...getBuyerFilterStages(buyerMobile),
    {
      $addFields: {
        dateKey: {
          $dateToString: {
            format,
            date: "$date",
            timezone: IST_TIMEZONE
          }
        }
      }
    },
    {
      $group: {
        _id: "$dateKey",
        totalQuantity: { $sum: "$quantity" },
        totalAmount: { $sum: "$totalAmount" }
      }
    },
    {
      $sort: {
        _id: 1
      }
    }
  ];
  return MilkTransaction.aggregate(pipeline);
}

async function aggregateBuyerStats({ start, end, buyerMobile }) {
  if (!buyerMobile) {
    return null;
  }
  const pipeline = [
    {
      $match: {
        type: "sale",
        date: { $gte: start, $lte: end }
      }
    },
    ...getBuyerFilterStages(buyerMobile),
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: "$quantity" },
        totalAmount: { $sum: "$totalAmount" },
        transactionCount: { $sum: 1 }
      }
    }
  ];
  const [result] = await MilkTransaction.aggregate(pipeline);
  return result;
}

function toStat(entry) {
  return {
    quantity: Number(entry?.totalQuantity ?? 0),
    amount: Number(entry?.totalAmount ?? 0),
    transactions: Number(entry?.transactionCount ?? 0)
  };
}

const tableDivider = {
  header: { disabled: false, width: 0.8, opacity: 1 },
  horizontal: { disabled: false, width: 0.5, opacity: 1 },
  vertical: { disabled: false, width: 0.5, opacity: 1 }
};

const getProfitLoss = (req, res) => {
  const period = String(req.query.period || "monthly");
  const report = {
    period,
    totalRevenue: 0,
    totalExpenses: 0,
    profit: 0,
    loss: 0,
    details: {
      milkSales: 0,
      animalSales: 0,
      milkPurchases: 0,
      animalPurchases: 0,
      charaPurchases: 0,
      otherExpenses: 0
    }
  };
  return res.json(report);
};

async function getDashboardSummary(req, res) {
  try {
    const todayRange = getIstDayRange(new Date());
    const trendPeriod = String(req.query.trendPeriod || "weekly").toLowerCase();
    const normalizedTrend = TREND_PERIOD_LABELS[trendPeriod]
      ? trendPeriod
      : "weekly";
    const trendConfig = getTrendConfig(normalizedTrend, todayRange);
    // Compute IST month/year start instants (UTC timestamps).
    const istStart = new Date(todayRange.start.getTime() + IST_OFFSET_MS);
    const monthlyStart = new Date(Date.UTC(istStart.getUTCFullYear(), istStart.getUTCMonth(), 1) - IST_OFFSET_MS);
    const yearlyStart = new Date(Date.UTC(istStart.getUTCFullYear(), 0, 1) - IST_OFFSET_MS);

    const normalizedBuyerMobile = normalizeBuyerMobile(req.query.buyerMobile);

    const [charaDailyResult] = await CharaPurchase.aggregate([
      {
        $match: {
          date: { $gte: todayRange.start, $lte: todayRange.end }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    const [milkDailyExpenseResult] = await MilkTransaction.aggregate([
      {
        $match: {
          type: "purchase",
          date: { $gte: todayRange.start, $lte: todayRange.end }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    const [dailySalesResult] = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: todayRange.start, $lte: todayRange.end }
        }
      },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    const [monthlySalesResult] = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: monthlyStart, $lte: todayRange.end }
        }
      },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    const userConsumptionAgg = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: monthlyStart, $lte: todayRange.end }
        }
      },
      {
        $addFields: {
          normalizedBuyerPhone: {
            $trim: {
              input: { $ifNull: ["$buyerPhone", ""] }
            }
          }
        }
      },
      {
        $match: {
          normalizedBuyerPhone: { $ne: "" }
        }
      },
      {
        $group: {
          _id: "$normalizedBuyerPhone",
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" }
        }
      },
      {
        $sort: {
          totalQuantity: -1,
          totalAmount: -1
        }
      }
    ]);

    const rawTrend = await aggregateTrendData({
      start: trendConfig.start,
      end: trendConfig.end,
      unit: trendConfig.unit
    });

    const trendSeries = buildTrendSeries(rawTrend, trendConfig);

    // Yearly sales total
    const [yearlySalesResult] = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: yearlyStart, $lte: todayRange.end }
        }
      },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    // Monthly sales by milk source (Cow, Buffalo, Sheep, Goat)
    const monthlySalesByMilkSource = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: monthlyStart, $lte: todayRange.end }
        }
      },
      {
        $addFields: {
          source: { $ifNull: ["$milkSource", "cow"] }
        }
      },
      {
        $group: {
          _id: "$source",
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    const consumerPhones = userConsumptionAgg.map((entry) => entry._id);
    const consumers = await User.find({
      mobile: { $in: consumerPhones },
      role: UserRoles.CONSUMER
    }).select("name mobile");

    const consumerLookup = new Map(consumers.map((user) => [user.mobile, user]));
    const userConsumptions = userConsumptionAgg.map((entry) => {
      const user = consumerLookup.get(entry._id);
      const quantity = Number(entry.totalQuantity ?? 0);
      const totalAmount = Number(entry.totalAmount ?? 0);
      return {
        userId: user?._id?.toString(),
        name: user?.name || "Unknown Buyer",
        mobile: entry._id,
        totalQuantity: quantity,
        totalAmount,
        averageRate: quantity ? totalAmount / quantity : 0
      };
    });

    let selectedBuyer = null;
    if (normalizedBuyerMobile) {
      const buyerUser = await User.findOne({
        mobile: normalizedBuyerMobile,
        role: UserRoles.CONSUMER
      }).select("name mobile");

      const buyerDailyStats = await aggregateBuyerStats({
        start: todayRange.start,
        end: todayRange.end,
        buyerMobile: normalizedBuyerMobile
      });

      const buyerMonthlyStats = await aggregateBuyerStats({
        start: monthlyStart,
        end: todayRange.end,
        buyerMobile: normalizedBuyerMobile
      });

      const buyerTrendRaw = await aggregateTrendData({
        start: trendConfig.start,
        end: trendConfig.end,
        unit: trendConfig.unit,
        buyerMobile: normalizedBuyerMobile
      });

      const buyerTrendSeries = buildTrendSeries(buyerTrendRaw, trendConfig);

      const averageRate = buyerMonthlyStats?.totalQuantity
        ? Number(buyerMonthlyStats.totalAmount) / Number(buyerMonthlyStats.totalQuantity)
        : 0;

      selectedBuyer = {
        userId: buyerUser?._id?.toString(),
        name: buyerUser?.name || "Unknown Buyer",
        mobile: normalizedBuyerMobile,
        dailySales: toStat(buyerDailyStats),
        monthlySales: toStat(buyerMonthlyStats),
        trend: buyerTrendSeries,
        averageRate
      };
    }

    const milkSourceLabels = { cow: "Cow", buffalo: "Buffalo", sheep: "Sheep", goat: "Goat" };
    const sourceMap = new Map(
      monthlySalesByMilkSource.map((entry) => [
        entry._id,
        {
          milkSource: entry._id,
          label: milkSourceLabels[entry._id] || entry._id,
          quantity: Number(entry.totalQuantity ?? 0),
          amount: Number(entry.totalAmount ?? 0),
          transactions: Number(entry.transactionCount ?? 0)
        }
      ])
    );
    // Always return all 4 milk sources (with 0 for missing)
    const salesByMilkSource = ["cow", "buffalo", "sheep", "goat"].map((src) =>
      sourceMap.get(src) || {
        milkSource: src,
        label: milkSourceLabels[src] || src,
        quantity: 0,
        amount: 0,
        transactions: 0
      }
    );

    // Yearly sales by milk source
    const yearlySalesByMilkSource = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: yearlyStart, $lte: todayRange.end }
        }
      },
      {
        $addFields: {
          source: { $ifNull: ["$milkSource", "cow"] }
        }
      },
      {
        $group: {
          _id: "$source",
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    const yearlySourceMap = new Map(
      yearlySalesByMilkSource.map((entry) => [
        entry._id,
        {
          milkSource: entry._id,
          label: milkSourceLabels[entry._id] || entry._id,
          quantity: Number(entry.totalQuantity ?? 0),
          amount: Number(entry.totalAmount ?? 0),
          transactions: Number(entry.transactionCount ?? 0)
        }
      ])
    );
    const yearlySalesByMilkSourceList = ["cow", "buffalo", "sheep", "goat"].map((src) =>
      yearlySourceMap.get(src) || {
        milkSource: src,
        label: milkSourceLabels[src] || src,
        quantity: 0,
        amount: 0,
        transactions: 0
      }
    );

    const dashboardSummary = {
      generatedAt: new Date().toISOString(),
      dailyExpenses: Number(
        (charaDailyResult?.totalAmount ?? 0) + (milkDailyExpenseResult?.totalAmount ?? 0)
      ),
      dailyExpenseBreakdown: {
        charaPurchases: Number(charaDailyResult?.totalAmount ?? 0),
        milkPurchases: Number(milkDailyExpenseResult?.totalAmount ?? 0)
      },
      dailySales: {
        quantity: Number(dailySalesResult?.totalQuantity ?? 0),
        amount: Number(dailySalesResult?.totalAmount ?? 0),
        transactions: Number(dailySalesResult?.transactionCount ?? 0)
      },
      monthlySales: {
        quantity: Number(monthlySalesResult?.totalQuantity ?? 0),
        amount: Number(monthlySalesResult?.totalAmount ?? 0),
        transactions: Number(monthlySalesResult?.transactionCount ?? 0)
      },
      yearlySales: {
        quantity: Number(yearlySalesResult?.totalQuantity ?? 0),
        amount: Number(yearlySalesResult?.totalAmount ?? 0),
        transactions: Number(yearlySalesResult?.transactionCount ?? 0)
      },
      userConsumptions,
      salesByMilkSource,
      yearlySalesByMilkSource: yearlySalesByMilkSourceList,
      salesTrend: trendSeries,
      selectedBuyer,
      trendMetadata: {
        period: trendConfig.period,
        periodLabel: trendConfig.label,
        unit: trendConfig.unit,
        length: trendConfig.length,
        startDate: formatMetadataDate(trendConfig.start, trendConfig.unit),
        endDate: formatMetadataDate(trendConfig.end, trendConfig.unit)
      }
    };

    return res.json(dashboardSummary);
  } catch (error) {
    console.error("[reports] Failed to fetch dashboard summary:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch dashboard summary", message: error.message });
  }
}

async function getConsumerConsumptionMonthly(req, res) {
  try {
    const periodRange = getMonthRange(req.query.year, req.query.month);
    const pipeline = [
      {
        $match: {
          type: "sale",
          date: { $gte: periodRange.start, $lte: periodRange.end }
        }
      },
      {
        $addFields: {
          normalizedBuyerPhone: {
            $trim: { input: { $ifNull: ["$buyerPhone", ""] } }
          }
        }
      },
      { $match: { normalizedBuyerPhone: { $ne: "" } } },
      {
        $group: {
          _id: "$normalizedBuyerPhone",
          buyerName: { $first: "$buyer" },
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ];
    const agg = await MilkTransaction.aggregate(pipeline);
    const consumerPhones = agg.map((e) => e._id);
    const users = await User.find({
      mobile: { $in: consumerPhones },
      role: UserRoles.CONSUMER
    }).select("name mobile");
    const nameByMobile = new Map(users.map((u) => [u.mobile, u.name]));
    const summary = agg.map((e) => {
      const qty = Number(e.totalQuantity ?? 0);
      const amt = Number(e.totalAmount ?? 0);
      return {
        name: nameByMobile.get(e._id) || e.buyerName || "Unknown",
        mobile: e._id,
        totalQuantity: qty,
        totalAmount: amt,
        averageRate: qty ? amt / qty : 0,
        transactionCount: Number(e.transactionCount ?? 0)
      };
    });
    const dailyTrend = await MilkTransaction.aggregate([
      {
        $match: {
          type: "sale",
          date: { $gte: periodRange.start, $lte: periodRange.end }
        }
      },
      {
        $addFields: {
          dateKey: {
            $dateToString: { format: "%Y-%m-%d", date: "$date" }
          }
        }
      },
      {
        $group: {
          _id: "$dateKey",
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    return res.json({
      year: periodRange.year,
      month: periodRange.month,
      startDate: periodRange.start.toISOString().slice(0, 10),
      endDate: periodRange.end.toISOString().slice(0, 10),
      summary,
      dailyTrend: dailyTrend.map((d) => ({
        date: d._id,
        totalQuantity: Number(d.totalQuantity ?? 0),
        totalAmount: Number(d.totalAmount ?? 0)
      }))
    });
  } catch (error) {
    console.error("[reports] getConsumerConsumptionMonthly:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch consumer consumption", message: error.message });
  }
}

async function downloadConsumerConsumptionExcel(req, res) {
  try {
    const upToToday = req.query.upToToday === "1" || req.query.upToToday === "true";
    const periodRange = getMonthRange(req.query.year, req.query.month, upToToday);
    const allConsumers = req.query.allConsumers === "1" || req.query.allConsumers === "true";
    const normalizedBuyerMobile = allConsumers ? null : normalizeBuyerMobile(req.query.buyerMobile);
    const pipeline = [
      {
        $match: {
          type: "sale",
          date: { $gte: periodRange.start, $lte: periodRange.end }
        }
      },
      {
        $addFields: {
          normalizedBuyerPhone: {
            $trim: { input: { $ifNull: ["$buyerPhone", ""] } }
          }
        }
      },
      { $match: { normalizedBuyerPhone: { $ne: "" } } },
      ...(normalizedBuyerMobile ? [{ $match: { normalizedBuyerPhone: normalizedBuyerMobile } }] : []),
      {
        $group: {
          _id: "$normalizedBuyerPhone",
          buyerName: { $first: "$buyer" },
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 },
          milkSources: { $addToSet: { $ifNull: ["$milkSource", "cow"] } }
        }
      },
      { $sort: { totalAmount: -1 } }
    ];
    const agg = await MilkTransaction.aggregate(pipeline);
    const consumerPhones = agg.map((e) => e._id);
    const users = await User.find({
      mobile: { $in: consumerPhones },
      role: UserRoles.CONSUMER
    }).select("name mobile");
    const nameByMobile = new Map(users.map((u) => [u.mobile, u.name]));
    const milkSourceLabels = { cow: "Cow", buffalo: "Buffalo", sheep: "Sheep", goat: "Goat" };
    const summary = agg.map((e) => {
      const qty = Number(e.totalQuantity ?? 0);
      const amt = Number(e.totalAmount ?? 0);
      const sources = (e.milkSources || []).filter(Boolean).map((s) => milkSourceLabels[s] || s);
      const sourceStr = [...new Set(sources)].length ? [...new Set(sources)].join(", ") : "Cow";
      return {
        name: nameByMobile.get(e._id) || e.buyerName || "Unknown",
        mobile: e._id,
        totalQuantity: qty,
        totalAmount: amt,
        averageRate: qty ? amt / qty : 0,
        transactionCount: Number(e.transactionCount ?? 0),
        milkSource: sourceStr
      };
    });

    const totalQty = summary.reduce((s, r) => s + r.totalQuantity, 0);
    const totalAmt = summary.reduce((s, r) => s + r.totalAmount, 0);
    const header = ["S.No.", "Consumer Name", "Mobile", "Source", "Total Qty (L)", "Price (₹/L)", "Days (Visits)", "Total Price (₹)"];
    const rows = summary.map((r, i) => [
      i + 1,
      r.name,
      r.mobile || "",
      r.milkSource || "Cow",
      Number(r.totalQuantity.toFixed(2)),
      Number(r.averageRate.toFixed(2)),
      r.transactionCount,
      Number(r.totalAmount.toFixed(2))
    ]);
    const totalRow = ["", "TOTAL", "", "", Number(totalQty.toFixed(2)), "", "", Number(totalAmt.toFixed(2))];
    const monthTotalRow = ["Month Total", totalQty.toFixed(2) + " L milk sold", "", "", "", "", "Total Amount", "₹" + totalAmt.toFixed(2)];
    const wsData = [monthTotalRow, [], header, ...rows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const colWidths = [{ wch: 6 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    const sheetName = `Consumer_${periodRange.year}_${String(periodRange.month).padStart(2, "0")}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const detailPipeline = [
      { $match: { type: "sale", date: { $gte: periodRange.start, $lte: periodRange.end } } },
      { $addFields: { normalizedBuyerPhone: { $trim: { input: { $ifNull: ["$buyerPhone", ""] } } } } },
      { $match: { normalizedBuyerPhone: { $ne: "" } } },
      ...(normalizedBuyerMobile ? [{ $match: { normalizedBuyerPhone: normalizedBuyerMobile } }] : []),
      { $sort: { date: 1 } },
      { $project: { date: 1, buyer: 1, buyerPhone: 1, quantity: 1, pricePerLiter: 1, totalAmount: 1, normalizedBuyerPhone: 1, milkSource: 1 } }
    ];
    const detailTx = await MilkTransaction.aggregate(detailPipeline);
    if (normalizedBuyerMobile && detailTx.length > 0) {
      const detailHeader = ["Date", "Quantity (L)", "Source", "Price/L (₹)", "Total (₹)"];
      const detailRows = detailTx.map((tx) => {
        const src = (tx.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(tx.milkSource)) ? tx.milkSource : "cow";
        const srcLabel = milkSourceLabels[src] || src;
        return [
          tx.date ? new Date(tx.date).toISOString().slice(0, 10) : "",
          Number(tx.quantity ?? 0).toFixed(2),
          srcLabel,
          Number(tx.pricePerLiter ?? 0).toFixed(2),
          Number(tx.totalAmount ?? 0).toFixed(2)
        ];
      });
      const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
      wsDetail["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, "Day_wise_Detail");
    } else if (!normalizedBuyerMobile) {
      const detailHeader = ["Date", "Consumer Name", "Mobile", "Qty (L)", "Source", "Price/L (₹)", "Total (₹)"];
      const detailRows = detailTx.map((tx) => {
        const ph = (tx.normalizedBuyerPhone || tx.buyerPhone || "").trim();
        const nm = nameByMobile.get(ph) || tx.buyer || "Unknown";
        const src = (tx.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(tx.milkSource)) ? tx.milkSource : "cow";
        const srcLabel = milkSourceLabels[src] || src;
        return [
          tx.date ? new Date(tx.date).toISOString().slice(0, 10) : "",
          nm,
          ph,
          Number(tx.quantity ?? 0).toFixed(2),
          srcLabel,
          Number(tx.pricePerLiter ?? 0).toFixed(2),
          Number(tx.totalAmount ?? 0).toFixed(2)
        ];
      });
      const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
      wsDetail["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, "Day_wise_Detail");
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const suffix = normalizedBuyerMobile ? `-${(summary[0]?.name || "customer").replace(/\s+/g, "-")}` : "";
    const filename = `consumer-milk-consumption-${periodRange.year}-${String(periodRange.month).padStart(2, "0")}${suffix}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (error) {
    console.error("[reports] downloadConsumerConsumptionExcel:", error);
    return res
      .status(500)
      .json({ error: "Failed to export Excel", message: error.message });
  }
}

async function downloadConsumerConsumptionPdf(req, res) {
  try {
    const upToToday = req.query.upToToday === "1" || req.query.upToToday === "true";
    const periodRange = getMonthRange(req.query.year, req.query.month, upToToday);
    const allConsumers = req.query.allConsumers === "1" || req.query.allConsumers === "true";
    const normalizedBuyerMobile = allConsumers ? null : normalizeBuyerMobile(req.query.buyerMobile);
    const pipeline = [
      {
        $match: {
          type: "sale",
          date: { $gte: periodRange.start, $lte: periodRange.end }
        }
      },
      {
        $addFields: {
          normalizedBuyerPhone: {
            $trim: { input: { $ifNull: ["$buyerPhone", ""] } }
          }
        }
      },
      { $match: { normalizedBuyerPhone: { $ne: "" } } },
      ...(normalizedBuyerMobile ? [{ $match: { normalizedBuyerPhone: normalizedBuyerMobile } }] : []),
      {
        $group: {
          _id: "$normalizedBuyerPhone",
          buyerName: { $first: "$buyer" },
          totalQuantity: { $sum: "$quantity" },
          totalAmount: { $sum: "$totalAmount" },
          transactionCount: { $sum: 1 },
          milkSources: { $addToSet: { $ifNull: ["$milkSource", "cow"] } }
        }
      },
      { $sort: { totalAmount: -1 } }
    ];
    const agg = await MilkTransaction.aggregate(pipeline);
    const consumerPhones = agg.map((e) => e._id);
    const users = await User.find({
      mobile: { $in: consumerPhones },
      role: UserRoles.CONSUMER
    }).select("name mobile");
    const nameByMobile = new Map(users.map((u) => [u.mobile, u.name]));
    const milkSourceLabels = { cow: "Cow", buffalo: "Buffalo", sheep: "Sheep", goat: "Goat" };
    const summary = agg.map((e) => {
      const qty = Number(e.totalQuantity ?? 0);
      const amt = Number(e.totalAmount ?? 0);
      const sources = (e.milkSources || []).filter(Boolean).map((s) => milkSourceLabels[s] || s);
      const sourceStr = [...new Set(sources)].length ? [...new Set(sources)].join(", ") : "Cow";
      return {
        name: nameByMobile.get(e._id) || e.buyerName || "Unknown",
        mobile: e._id,
        totalQuantity: qty,
        totalAmount: amt,
        averageRate: qty ? amt / qty : 0,
        transactionCount: Number(e.transactionCount ?? 0),
        milkSource: sourceStr
      };
    });

    const doc = new PDFDocument({ margin: 40 });
    const nameSuffix = normalizedBuyerMobile && summary.length > 0 ? `-${(summary[0].name || "customer").replace(/\s+/g, "-")}` : "";
    const filename = `consumer-milk-consumption-${periodRange.year}-${String(periodRange.month).padStart(2, "0")}${nameSuffix}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const monthName = new Date(periodRange.year, periodRange.month - 1).toLocaleString("en-IN", { month: "long" });
    const totalQty = summary.reduce((s, r) => s + r.totalQuantity, 0);
    const totalAmt = summary.reduce((s, r) => s + r.totalAmount, 0);

    doc.fontSize(16).text(`Consumer Milk Consumption - ${monthName} ${periodRange.year}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`From ${periodRange.start.toISOString().slice(0, 10)} to ${periodRange.end.toISOString().slice(0, 10)}`, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica-Bold").text(
      `Month Total: ${totalQty.toFixed(2)} L milk sold | Total Amount: ₹${totalAmt.toFixed(2)}`,
      { align: "center" }
    );
    doc.moveDown(1);

    const colWidths = [22, 70, 45, 38, 42, 40, 28, 52];
    const summaryRows = summary.map((r, i) => [
      String(i + 1),
      (r.name || "").slice(0, 20),
      (r.mobile || "").slice(0, 12),
      (r.milkSource || "Cow").slice(0, 10),
      r.totalQuantity.toFixed(2),
      r.averageRate.toFixed(2),
      String(r.transactionCount),
      r.totalAmount.toFixed(2)
    ]);
    const totalRow = ["", "TOTAL", "", "", totalQty.toFixed(2), "", "", totalAmt.toFixed(2)];
    const summaryTable = {
      headers: ["S.No.", "Name", "Mobile", "Source", "Total Qty (L)", "Price (₹/L)", "Days", "Total (₹)"],
      rows: [...summaryRows, totalRow]
    };
    await doc.table(summaryTable, {
      columnsSize: colWidths,
      divider: tableDivider,
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9),
      prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
        if (indexRow === summaryRows.length) {
          doc.font("Helvetica-Bold").fontSize(9);
        } else {
          doc.font("Helvetica").fontSize(9);
        }
      }
    });
    const detailPipeline = [
      { $match: { type: "sale", date: { $gte: periodRange.start, $lte: periodRange.end } } },
      { $addFields: { normalizedBuyerPhone: { $trim: { input: { $ifNull: ["$buyerPhone", ""] } } } } },
      { $match: { normalizedBuyerPhone: { $ne: "" } } },
      ...(normalizedBuyerMobile ? [{ $match: { normalizedBuyerPhone: normalizedBuyerMobile } }] : []),
      { $sort: { date: 1 } },
      { $project: { date: 1, buyer: 1, buyerPhone: 1, quantity: 1, pricePerLiter: 1, totalAmount: 1, normalizedBuyerPhone: 1, milkSource: 1 } }
    ];
    const detailTx = await MilkTransaction.aggregate(detailPipeline);
    doc.moveDown(1);
    doc.fontSize(12).font("Helvetica-Bold").text("Day-wise Detail (har din ki har transaction)", { underline: true });
    doc.moveDown(0.5);
    if (normalizedBuyerMobile && detailTx.length > 0) {
      const dCols = [70, 42, 50, 55, 55];
      const detailRows = detailTx.map((tx) => {
        const src = (tx.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(tx.milkSource)) ? tx.milkSource : "cow";
        const srcLabel = milkSourceLabels[src] || src;
        return [
          tx.date ? new Date(tx.date).toISOString().slice(0, 10) : "",
          srcLabel,
          Number(tx.quantity ?? 0).toFixed(2),
          Number(tx.pricePerLiter ?? 0).toFixed(2),
          Number(tx.totalAmount ?? 0).toFixed(2)
        ];
      });
      const daywiseTable = { headers: ["Date", "Source", "Qty (L)", "Price/L", "Total (₹)"], rows: detailRows };
      await doc.table(daywiseTable, {
        columnsSize: dCols,
        divider: tableDivider,
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9),
        prepareRow: () => doc.font("Helvetica").fontSize(9)
      });
    } else if (!normalizedBuyerMobile && detailTx.length > 0) {
      const dCols = [55, 55, 38, 40, 40, 45, 50];
      const detailRows = detailTx.map((tx) => {
        const ph = (tx.normalizedBuyerPhone || tx.buyerPhone || "").trim();
        const nm = nameByMobile.get(ph) || tx.buyer || "Unknown";
        const src = (tx.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(tx.milkSource)) ? tx.milkSource : "cow";
        const srcLabel = milkSourceLabels[src] || src;
        return [
          tx.date ? new Date(tx.date).toISOString().slice(0, 10) : "",
          (nm || "").slice(0, 16),
          ph,
          srcLabel,
          Number(tx.quantity ?? 0).toFixed(2),
          Number(tx.pricePerLiter ?? 0).toFixed(2),
          Number(tx.totalAmount ?? 0).toFixed(2)
        ];
      });
      const daywiseTable = {
        headers: ["Date", "Consumer", "Mobile", "Source", "Qty (L)", "Price/L", "Total (₹)"],
        rows: detailRows
      };
      await doc.table(daywiseTable, {
        columnsSize: dCols,
        divider: tableDivider,
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
        prepareRow: () => doc.font("Helvetica").fontSize(8)
      });
    }
    doc.end();
  } catch (error) {
    console.error("[reports] downloadConsumerConsumptionPdf:", error);
    return res
      .status(500)
      .json({ error: "Failed to export PDF", message: error.message });
  }
}

async function downloadBuyerConsumptionCsv(req, res) {
  try {
    const todayRange = getUtcDayRange(new Date());
    const periodRange = getMonthRange(req.query.year, req.query.month);
    const normalizedBuyerMobile = normalizeBuyerMobile(req.query.buyerMobile);

    const matchStage = {
      type: "sale",
      date: { $gte: periodRange.start, $lte: periodRange.end }
    };

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          normalizedBuyerPhone: {
            $trim: {
              input: { $ifNull: ["$buyerPhone", ""] }
            }
          }
        }
      }
    ];

    if (normalizedBuyerMobile) {
      pipeline.push({
        $match: { normalizedBuyerPhone: normalizedBuyerMobile }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "normalizedBuyerPhone",
          foreignField: "mobile",
          as: "buyerUser"
        }
      },
      {
        $unwind: {
          path: "$buyerUser",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          date: 1,
          quantity: 1,
          pricePerLiter: 1,
          totalAmount: 1,
          buyerName: {
            $ifNull: ["$buyerUser.name", "Unknown Buyer"]
          },
          buyerMobile: "$normalizedBuyerPhone"
        }
      },
      {
        $sort: { date: 1 }
      }
    );

    const transactions = await MilkTransaction.aggregate(pipeline);

    const rows = [
      [
        "Buyer Name",
        "Mobile",
        "Date",
        "Quantity (L)",
        "Price per L",
        "Total Amount"
      ]
    ];

    transactions.forEach((tx) => {
      const dateLabel = tx.date
        ? new Date(tx.date).toISOString().split("T")[0]
        : "";
      rows.push([
        escapeCsvField(tx.buyerName),
        escapeCsvField(tx.buyerMobile || ""),
        escapeCsvField(dateLabel),
        escapeCsvField(tx.quantity?.toFixed?.(2) ?? Number(tx.quantity ?? 0).toFixed(2)),
        escapeCsvField(tx.pricePerLiter?.toFixed?.(2) ?? Number(tx.pricePerLiter ?? 0).toFixed(2)),
        escapeCsvField(tx.totalAmount?.toFixed?.(2) ?? Number(tx.totalAmount ?? 0).toFixed(2))
      ]);
    });

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const filename = `buyer-purchases-${periodRange.year}-${String(periodRange.month).padStart(2, "0")}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error) {
    console.error("[reports] Failed to export buyer consumption:", error);
    return res.status(500).json({
      error: "Failed to export buyer purchases",
      message: error.message
    });
  }
}

module.exports = {
  getProfitLoss,
  getDashboardSummary,
  getConsumerConsumptionMonthly,
  downloadConsumerConsumptionExcel,
  downloadConsumerConsumptionPdf,
  downloadBuyerConsumptionCsv
};

