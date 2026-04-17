const { listBillsForBuyer } = require("../models/buyerBills");
const { getBuyerById } = require("../models/buyers");

const listBuyerBills = async (req, res) => {
  try {
    const { buyerId } = req.params;
    const buyer = await getBuyerById(buyerId);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "24"), 10) || 24));
    const bills = await listBillsForBuyer(buyer._id, limit);
    return res.json(bills);
  } catch (error) {
    console.error("[bills] listBuyerBills:", error);
    return res.status(500).json({ error: "Failed to fetch bills", message: error.message });
  }
};

module.exports = {
  listBuyerBills,
};
