const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const { listBuyers, getMyBuyerProfile, updateMyBuyerProfile, updateBuyer, createBuyerFromSeller } = require("../controllers/buyers.controller");

const router = Router();

router.get("/", requireAuth, listBuyers);
router.get("/me", requireAuth, getMyBuyerProfile);
router.patch("/me", requireAuth, updateMyBuyerProfile);
router.post("/from-seller/:sellerId", requireAuth, createBuyerFromSeller);
router.patch("/:id", requireAuth, updateBuyer);

module.exports = { router };

