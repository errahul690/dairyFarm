const { getAllBuyers, getBuyerById, updateBuyerById, findBuyerByUserId, addBuyer, updateBuyer: updateBuyerModel } = require("../models/buyers");
const { findSellerByUserId, getSellerById } = require("../models/sellers");
const { User } = require("../models/users");

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
    });
  } catch (error) {
    console.error("[buyers] getMyBuyerProfile:", error);
    return res.status(500).json({ error: "Failed to fetch profile", message: error.message });
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
    const allowed = ["active", "quantity", "rate", "name", "milkSource", "deliveryItems", "deliveryDays", "deliveryCycleDays", "deliveryCycleStartDate", "billingMode", "billingDayOfMonth"];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
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
          if (!(q > 0 && r >= 0)) return null;
          return { milkSource: src, quantity: q, rate: r };
        })
        .filter(Boolean);
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
      deliveryDays: updated.deliveryDays,
      deliveryCycleDays: updated.deliveryCycleDays,
      deliveryCycleStartDate: updated.deliveryCycleStartDate,
      billingMode: updated.billingMode,
      billingDayOfMonth: updated.billingDayOfMonth,
      lastBillingPeriodEnd: updated.lastBillingPeriodEnd,
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

module.exports = {
  listBuyers,
  getMyBuyerProfile,
  updateMyBuyerProfile,
  updateBuyer,
  createBuyerFromSeller,
};

