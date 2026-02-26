const { getAllBuyers, getBuyerById, updateBuyerById, findBuyerByUserId, addBuyer } = require("../models/buyers");
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
          deliveryDays: buyer.deliveryDays,
          deliveryCycleDays: buyer.deliveryCycleDays,
          deliveryCycleStartDate: buyer.deliveryCycleStartDate,
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
      deliveryDays: buyer.deliveryDays,
      deliveryCycleDays: buyer.deliveryCycleDays,
      deliveryCycleStartDate: buyer.deliveryCycleStartDate,
    });
  } catch (error) {
    console.error("[buyers] getMyBuyerProfile:", error);
    return res.status(500).json({ error: "Failed to fetch profile", message: error.message });
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
    const allowed = ["active", "quantity", "rate", "name", "milkSource", "deliveryDays", "deliveryCycleDays", "deliveryCycleStartDate"];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    if (filtered.deliveryCycleStartDate != null && typeof filtered.deliveryCycleStartDate === "string") {
      filtered.deliveryCycleStartDate = new Date(filtered.deliveryCycleStartDate);
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
      deliveryDays: updated.deliveryDays,
      deliveryCycleDays: updated.deliveryCycleDays,
      deliveryCycleStartDate: updated.deliveryCycleStartDate,
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
  updateBuyer,
  createBuyerFromSeller,
};

