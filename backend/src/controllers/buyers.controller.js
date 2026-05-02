const { getAllBuyers, getBuyerById, updateBuyerById, findBuyerByUserId, addBuyer, updateBuyer: updateBuyerModel } = require("../models/buyers");
const { findSellerByUserId, getSellerById } = require("../models/sellers");
const { User } = require("../models/users");
const { getBuyerBalanceByBuyerId, listBuyerBalances } = require("../models/buyerBalances");
const { listMonthlySummariesForBuyer, listMonthlySummariesByMonthKey } = require("../models/buyerMonthlySummaries");
const { rebuildBuyerBalanceAndMonthly } = require("../services/buyerBalance.service");

/**
 * Get all buyers with user details
 * GET /buyers
 * GET /buyers?active=true - only active buyers (for Sale / Quick Sale)
 */
const listBuyers = async (req, res) => {
  try {
    const activeOnly = req.query.active === "true";
    const filter = activeOnly ? { active: true } : {};
    console.log("[buyers] Fetching buyers...", activeOnly ? "(active only)" : "");
    const buyers = await getAllBuyers(filter);
    console.log(`[buyers] Found ${buyers.length} buyers`);
    
    const buyersWithUserDetails = await Promise.all(
      buyers.map(async (buyer) => {
        const [user, sellerRecord] = await Promise.all([
          User.findById(buyer.userId),
          findSellerByUserId(buyer.userId),
        ]);
        return {
          _id: buyer._id,
          userId: buyer.userId,
          name: buyer.name || user?.name,
          mobile: user?.mobile,
          email: user?.email,
          quantity: buyer.quantity,
          rate: buyer.rate,
          active: buyer.active !== false,
          isAlsoSeller: !!sellerRecord,
          milkSource: buyer.milkSource || 'cow',
          deliveryItems: buyer.deliveryItems,
          deliveryDays: buyer.deliveryDays,
          deliveryCycleDays: buyer.deliveryCycleDays,
          deliveryCycleStartDate: buyer.deliveryCycleStartDate,
          billingMode: buyer.billingMode,
          billingDayOfMonth: buyer.billingDayOfMonth,
          lastBillingPeriodEnd: buyer.lastBillingPeriodEnd,
          deliveryShift: buyer.deliveryShift || "both",
          morningDeliveryItems: buyer.morningDeliveryItems,
          eveningDeliveryItems: buyer.eveningDeliveryItems,
          createdAt: buyer.createdAt,
          updatedAt: buyer.updatedAt,
        };
      })
    );
    
    return res.json(buyersWithUserDetails);
  } catch (error) {
    console.error("[buyers] Failed to fetch buyers:", error);
    return res.status(500).json({ error: "Failed to fetch buyers", message: error.message });
  }
};

/**
 * Get current user's buyer profile (for role 2 - buyer app).
 * GET /buyers/me
 */
const getMyBuyerProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const buyer = await findBuyerByUserId(userId);
    if (!buyer) return res.status(404).json({ error: "Buyer profile not found" });
    const user = await User.findById(buyer.userId);
    return res.json({
      _id: buyer._id,
      userId: buyer.userId,
      name: buyer.name || user?.name,
      mobile: user?.mobile,
      email: user?.email,
      quantity: buyer.quantity,
      rate: buyer.rate,
      active: buyer.active !== false,
      milkSource: buyer.milkSource || 'cow',
      deliveryItems: buyer.deliveryItems,
      deliveryDays: buyer.deliveryDays,
      deliveryCycleDays: buyer.deliveryCycleDays,
      deliveryCycleStartDate: buyer.deliveryCycleStartDate,
      billingMode: buyer.billingMode,
      billingDayOfMonth: buyer.billingDayOfMonth,
      lastBillingPeriodEnd: buyer.lastBillingPeriodEnd,
      deliveryShift: buyer.deliveryShift || "both",
      morningDeliveryItems: buyer.morningDeliveryItems,
      eveningDeliveryItems: buyer.eveningDeliveryItems,
    });
  } catch (error) {
    console.error("[buyers] getMyBuyerProfile:", error);
    return res.status(500).json({ error: "Failed to fetch profile", message: error.message });
  }
};

/**
 * Buyer app: get my stored balance (pending = lifetime milk - lifetime payments; settlement ignored).
 * GET /buyers/me/balance
 */
const getMyBuyerBalance = async (req, res) => {
  try {
    if (req.user?.role !== 2) return res.status(403).json({ error: "Only buyers can access this" });
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const buyer = await findBuyerByUserId(userId);
    if (!buyer) return res.status(404).json({ error: "Buyer profile not found" });
    const balance = await getBuyerBalanceByBuyerId(buyer._id);
    if (!balance) {
      const doc = await rebuildBuyerBalanceAndMonthly(buyer._id);
      return res.json(doc || { buyerId: buyer._id.toString(), userId: buyer.userId.toString(), pendingAmount: 0, totalMilkAmount: 0, totalPaidAmount: 0 });
    }
    return res.json(balance);
  } catch (error) {
    console.error("[buyers] getMyBuyerBalance:", error);
    return res.status(500).json({ error: "Failed to fetch balance", message: error.message });
  }
};

/**
 * Buyer app: list my month summaries (opening/in/out/closing).
 * GET /buyers/me/monthly?limit=24
 */
const getMyBuyerMonthlySummaries = async (req, res) => {
  try {
    if (req.user?.role !== 2) return res.status(403).json({ error: "Only buyers can access this" });
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const buyer = await findBuyerByUserId(userId);
    if (!buyer) return res.status(404).json({ error: "Buyer profile not found" });
    const limit = Math.min(120, Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24));
    let list = await listMonthlySummariesForBuyer(buyer._id, limit);
    if (!Array.isArray(list) || list.length === 0) {
      await rebuildBuyerBalanceAndMonthly(buyer._id);
      list = await listMonthlySummariesForBuyer(buyer._id, limit);
    }
    return res.json(Array.isArray(list) ? list : []);
  } catch (error) {
    console.error("[buyers] getMyBuyerMonthlySummaries:", error);
    return res.status(500).json({ error: "Failed to fetch monthly summaries", message: error.message });
  }
};

/**
 * Admin: list stored monthly summaries for ALL buyers for a given monthKey.
 * GET /buyers/monthly-summary?monthKey=YYYY-MM&active=true
 */
const listBuyerMonthlySummariesByMonthKeyController = async (req, res) => {
  try {
    if (!(req.user?.role === 0 || req.user?.role === 1)) {
      return res.status(403).json({ error: "Only admins can access this" });
    }
    const adminUserId = req.user?.userId || req.user?._id;
    if (!adminUserId) return res.status(401).json({ error: "Unauthorized" });

    const monthKey = String(req.query.monthKey || "").trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return res.status(400).json({ error: "monthKey is required (YYYY-MM)" });
    }

    const activeOnly = req.query.active === "true";
    const limit = Math.min(10000, Math.max(1, parseInt(String(req.query.limit || "5000"), 10) || 5000));

    let buyerIds = null;
    if (activeOnly) {
      const buyers = await getAllBuyers({ active: true });
      buyerIds = (buyers || []).map((b) => b._id);
    }

    let list = await listMonthlySummariesByMonthKey(monthKey, buyerIds, limit);
    list = Array.isArray(list) ? list : [];

    return res.json(list);
  } catch (error) {
    console.error("[buyers] listBuyerMonthlySummariesByMonthKeyController:", error);
    return res.status(500).json({ error: "Failed to fetch monthly summaries", message: error.message });
  }
};

/**
 * Buyer updates own profile (quantity / deliveryItems only). Role 2 only.
 * PATCH /buyers/me
 */
const updateMyBuyerProfile = async (req, res) => {
  try {
    if (req.user?.role !== 2) {
      return res.status(403).json({ error: "Only buyers can update their own schedule quantity" });
    }
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const buyer = await findBuyerByUserId(userId);
    if (!buyer) return res.status(404).json({ error: "Buyer profile not found" });
    const updates = req.body || {};
    const allowed = ["quantity", "deliveryItems"];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    if (filtered.quantity != null) {
      const q = Number(filtered.quantity);
      if (!(q >= 0)) return res.status(400).json({ error: "Quantity must be 0 or more" });
      filtered.quantity = q;
    }
    if (Array.isArray(filtered.deliveryItems)) {
      filtered.deliveryItems = filtered.deliveryItems
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const src = (item.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(String(item.milkSource).toLowerCase()))
            ? String(item.milkSource).toLowerCase()
            : "cow";
          const q = Number(item.quantity);
          const r = Number(item.rate);
          if (!(q >= 0)) return null;
          return { milkSource: src, quantity: q, rate: (r >= 0 ? r : 0) };
        })
        .filter(Boolean);
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: "No valid fields to update. Send quantity or deliveryItems." });
    }
    const updated = await updateBuyerModel(userId, filtered);
    const user = await User.findById(updated.userId);
    return res.json({
      _id: updated._id,
      userId: updated.userId,
      name: updated.name || user?.name,
      mobile: user?.mobile,
      quantity: updated.quantity,
      rate: updated.rate,
      milkSource: updated.milkSource || 'cow',
      deliveryItems: updated.deliveryItems,
      deliveryDays: updated.deliveryDays,
      deliveryCycleDays: updated.deliveryCycleDays,
      deliveryCycleStartDate: updated.deliveryCycleStartDate,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("[buyers] updateMyBuyerProfile:", error);
    return res.status(500).json({ error: "Failed to update", message: error.message });
  }
};

/**
 * Update buyer (e.g. active/inactive)
 * PATCH /buyers/:id
 */
const updateBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const allowed = ["active", "quantity", "rate", "name", "milkSource", "deliveryItems", "morningDeliveryItems", "eveningDeliveryItems", "deliveryDays", "deliveryCycleDays", "deliveryCycleStartDate", "billingMode", "billingDayOfMonth", "deliveryShift"];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    if (filtered.deliveryShift !== undefined) {
      const ds = String(filtered.deliveryShift).trim();
      if (!["morning", "evening", "both"].includes(ds)) {
        return res.status(400).json({ error: "deliveryShift must be morning, evening, or both" });
      }
      filtered.deliveryShift = ds;
    }
    const normalizeDeliveryLines = (arr, label) => {
      if (!Array.isArray(arr)) return { ok: true, value: arr };
      const seen = new Set();
      const lines = [];
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const src = (item.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(String(item.milkSource).toLowerCase()))
          ? String(item.milkSource).toLowerCase()
          : "cow";
        if (seen.has(src)) {
          return { ok: false, message: `${label}: duplicate milk type "${src}". Use one row per type.` };
        }
        seen.add(src);
        const q = Number(item.quantity);
        const r = Number(item.rate);
        if (!(q > 0 && r >= 0)) continue;
        lines.push({ milkSource: src, quantity: q, rate: r });
      }
      return { ok: true, value: lines };
    };

    if (Array.isArray(filtered.deliveryItems)) {
      const r = normalizeDeliveryLines(filtered.deliveryItems, "deliveryItems");
      if (!r.ok) return res.status(400).json({ error: r.message });
      filtered.deliveryItems = r.value;
    }
    if (Array.isArray(filtered.morningDeliveryItems)) {
      const r = normalizeDeliveryLines(filtered.morningDeliveryItems, "morningDeliveryItems");
      if (!r.ok) return res.status(400).json({ error: r.message });
      filtered.morningDeliveryItems = r.value;
    }
    if (Array.isArray(filtered.eveningDeliveryItems)) {
      const r = normalizeDeliveryLines(filtered.eveningDeliveryItems, "eveningDeliveryItems");
      if (!r.ok) return res.status(400).json({ error: r.message });
      filtered.eveningDeliveryItems = r.value;
    }
    if (filtered.deliveryCycleStartDate != null && typeof filtered.deliveryCycleStartDate === "string") {
      filtered.deliveryCycleStartDate = new Date(filtered.deliveryCycleStartDate);
    }
    if (filtered.billingMode !== undefined || filtered.billingDayOfMonth !== undefined) {
      if (filtered.billingMode === null || filtered.billingMode === "") {
        filtered.billingMode = null;
        filtered.billingDayOfMonth = null;
      } else if (filtered.billingMode === undefined && filtered.billingDayOfMonth !== undefined) {
        if (filtered.billingDayOfMonth === null || filtered.billingDayOfMonth === "") {
          filtered.billingMode = null;
          filtered.billingDayOfMonth = null;
        } else {
          const bd = Number(filtered.billingDayOfMonth);
          if (!Number.isInteger(bd) || bd < 1 || bd > 31) {
            return res.status(400).json({ error: "billingDayOfMonth must be between 1 and 31" });
          }
          filtered.billingMode = "custom";
          filtered.billingDayOfMonth = bd;
        }
      } else {
        const bm = String(filtered.billingMode).trim();
        if (!["daily", "month_end", "custom"].includes(bm)) {
          return res.status(400).json({ error: "billingMode must be daily, month_end, or custom" });
        }
        filtered.billingMode = bm;
        if (bm === "daily" || bm === "month_end") {
          filtered.billingDayOfMonth = null;
        } else {
          if (filtered.billingDayOfMonth === null || filtered.billingDayOfMonth === "") {
            return res.status(400).json({ error: "billingDayOfMonth is required when billingMode is custom" });
          }
          const bd = Number(filtered.billingDayOfMonth);
          if (!Number.isInteger(bd) || bd < 1 || bd > 31) {
            return res.status(400).json({ error: "billingDayOfMonth must be between 1 and 31" });
          }
          filtered.billingDayOfMonth = bd;
        }
      }
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const buyer = await getBuyerById(id);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    const updated = await updateBuyerById(id, filtered);
    const user = await User.findById(updated.userId);
    return res.json({
      _id: updated._id,
      userId: updated.userId,
      name: updated.name || user?.name,
      mobile: user?.mobile,
      email: user?.email,
      quantity: updated.quantity,
      rate: updated.rate,
      active: updated.active !== false,
      milkSource: updated.milkSource || 'cow',
      deliveryItems: updated.deliveryItems,
      morningDeliveryItems: updated.morningDeliveryItems,
      eveningDeliveryItems: updated.eveningDeliveryItems,
      deliveryDays: updated.deliveryDays,
      deliveryCycleDays: updated.deliveryCycleDays,
      deliveryCycleStartDate: updated.deliveryCycleStartDate,
      billingMode: updated.billingMode,
      billingDayOfMonth: updated.billingDayOfMonth,
      lastBillingPeriodEnd: updated.lastBillingPeriodEnd,
      deliveryShift: updated.deliveryShift || "both",
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("[buyers] Update buyer error:", error);
    return res.status(500).json({ error: "Failed to update buyer", message: error.message });
  }
};

/**
 * Create buyer record from an existing seller (same person = buyer + seller).
 * POST /buyers/from-seller/:sellerId
 */
const createBuyerFromSeller = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const seller = await getSellerById(sellerId);
    if (!seller) return res.status(404).json({ error: "Seller not found" });
    const existing = await findBuyerByUserId(seller.userId);
    if (existing) {
      return res.status(400).json({ error: "This person is already a buyer" });
    }
    const user = await User.findById(seller.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const buyer = await addBuyer({
      userId: seller.userId,
      name: seller.name || user.name,
      quantity: seller.quantity ?? 0,
      rate: seller.rate ?? 0,
      active: true,
      milkSource: 'cow',
    });
    const result = {
      _id: buyer._id,
      userId: buyer.userId,
      name: buyer.name,
      mobile: user?.mobile,
      email: user?.email,
      quantity: buyer.quantity,
      rate: buyer.rate,
      active: buyer.active !== false,
      milkSource: buyer.milkSource || 'cow',
      createdAt: buyer.createdAt,
      updatedAt: buyer.updatedAt,
    };
    return res.status(201).json(result);
  } catch (error) {
    console.error("[buyers] createBuyerFromSeller:", error);
    return res.status(500).json({ error: "Failed to add as buyer", message: error.message });
  }
};

/**
 * Admin: list buyer balances (stored).
 * GET /buyers/balances?active=true
 */
const listBuyerBalancesController = async (req, res) => {
  try {
    const activeOnly = req.query.active === "true";
    const buyers = await getAllBuyers(activeOnly ? { active: true } : {});
    const buyerIds = buyers.map((b) => b._id);
    const balances = await listBuyerBalances({ buyerId: { $in: buyerIds } });
    return res.json(balances);
  } catch (error) {
    console.error("[buyers] listBuyerBalances:", error);
    return res.status(500).json({ error: "Failed to fetch buyer balances", message: error.message });
  }
};

/**
 * Admin: get monthly summaries for buyer.
 * GET /buyers/:id/monthly?limit=24
 */
const getBuyerMonthlySummariesController = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(120, Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24));
    const buyer = await getBuyerById(id);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    const list = await listMonthlySummariesForBuyer(buyer._id, limit);
    return res.json(list);
  } catch (error) {
    console.error("[buyers] getBuyerMonthlySummaries:", error);
    return res.status(500).json({ error: "Failed to fetch buyer monthly summaries", message: error.message });
  }
};

/**
 * Admin: force rebuild buyer balance/monthly from source-of-truth.
 * POST /buyers/:id/rebuild-balance
 */
const rebuildBuyerBalanceController = async (req, res) => {
  try {
    const { id } = req.params;
    const buyer = await getBuyerById(id);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    const doc = await rebuildBuyerBalanceAndMonthly(buyer._id);
    return res.json({ ok: true, balance: doc });
  } catch (error) {
    console.error("[buyers] rebuildBuyerBalance:", error);
    return res.status(500).json({ error: "Failed to rebuild balance", message: error.message });
  }
};

module.exports = {
  listBuyers,
  getMyBuyerProfile,
  getMyBuyerBalance,
  getMyBuyerMonthlySummaries,
  updateMyBuyerProfile,
  updateBuyer,
  createBuyerFromSeller,
  listBuyerBalancesController,
  getBuyerMonthlySummariesController,
  rebuildBuyerBalanceController,
  listBuyerMonthlySummariesByMonthKeyController,
};

