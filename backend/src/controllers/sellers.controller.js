const { getAllSellers, getSellerById, findSellerByUserId, addSeller } = require("../models/sellers");
const { getBuyerById, findBuyerByUserId, addBuyer } = require("../models/buyers");
const { User } = require("../models/users");

/**
 * Get all sellers with user details
 * GET /sellers
 */
const listSellers = async (_req, res) => {
  try {
    console.log("[sellers] Fetching all sellers...");
    const sellers = await getAllSellers();
    console.log(`[sellers] Found ${sellers.length} sellers in database`);
    
    // Populate user details and isAlsoBuyer for each seller
    const sellersWithUserDetails = await Promise.all(
      sellers.map(async (seller) => {
        const [user, buyerRecord] = await Promise.all([
          User.findById(seller.userId),
          findBuyerByUserId(seller.userId),
        ]);
        return {
          _id: seller._id,
          userId: seller.userId,
          name: seller.name || user?.name,
          mobile: user?.mobile,
          email: user?.email,
          quantity: seller.quantity,
          rate: seller.rate,
          isAlsoBuyer: !!buyerRecord,
          createdAt: seller.createdAt,
          updatedAt: seller.updatedAt,
        };
      })
    );
    
    console.log(`[sellers] Returning ${sellersWithUserDetails.length} sellers with user details`);
    return res.json(sellersWithUserDetails);
  } catch (error) {
    console.error("[sellers] Failed to fetch sellers:", error);
    console.error("[sellers] Error stack:", error.stack);
    return res.status(500).json({ error: "Failed to fetch sellers", message: error.message });
  }
};

/**
 * Create seller record from an existing buyer (same person = buyer + seller).
 * POST /sellers/from-buyer/:buyerId
 */
const createSellerFromBuyer = async (req, res) => {
  try {
    const { buyerId } = req.params;
    const buyer = await getBuyerById(buyerId);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    const existing = await findSellerByUserId(buyer.userId);
    if (existing) {
      return res.status(400).json({ error: "This person is already a seller" });
    }
    const user = await User.findById(buyer.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const seller = await addSeller({
      userId: buyer.userId,
      name: buyer.name || user.name,
      quantity: buyer.quantity ?? 0,
      rate: buyer.rate ?? 0,
    });
    const result = {
      _id: seller._id,
      userId: seller.userId,
      name: seller.name,
      mobile: user?.mobile,
      quantity: seller.quantity,
      rate: seller.rate,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
    };
    return res.status(201).json(result);
  } catch (error) {
    console.error("[sellers] createSellerFromBuyer:", error);
    return res.status(500).json({ error: "Failed to add as seller", message: error.message });
  }
};

module.exports = {
  listSellers,
  createSellerFromBuyer,
};
