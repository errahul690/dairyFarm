const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const { listSellers, createSellerFromBuyer } = require("../controllers/sellers.controller");

const router = Router();

router.get("/", requireAuth, listSellers);
router.post("/from-buyer/:buyerId", requireAuth, createSellerFromBuyer);

module.exports = { router };
