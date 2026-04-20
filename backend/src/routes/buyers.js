const { Router } = require("express");
const { requireAuth, requireAdminOrSuperAdmin } = require("../middleware/auth");
const {
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
} = require("../controllers/buyers.controller");

const router = Router();

router.get("/", requireAuth, listBuyers);
router.get("/balances", requireAuth, requireAdminOrSuperAdmin, listBuyerBalancesController);
router.get("/me", requireAuth, getMyBuyerProfile);
router.get("/me/balance", requireAuth, getMyBuyerBalance);
router.get("/me/monthly", requireAuth, getMyBuyerMonthlySummaries);
router.patch("/me", requireAuth, updateMyBuyerProfile);
router.post("/from-seller/:sellerId", requireAuth, createBuyerFromSeller);
router.patch("/:id", requireAuth, updateBuyer);
router.get("/:id/monthly", requireAuth, requireAdminOrSuperAdmin, getBuyerMonthlySummariesController);
router.post("/:id/rebuild-balance", requireAuth, requireAdminOrSuperAdmin, rebuildBuyerBalanceController);

module.exports = { router };

