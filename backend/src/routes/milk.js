const { Router } = require("express");
const { requireAuth, requireAdminOrSuperAdmin } = require("../middleware/auth");
const { 
  createMilkPurchase, 
  createMilkSale, 
  createQuickSale,
  listMilkTransactions,
  listMilkRequests,
  listInstallRequests,
  createInstallRequest,
  updateMilkTransaction,
  deleteMilkTransactionRecord,
  getUnpaidMilkTransactions
} = require("../controllers/milk.controller");

const router = Router();

router.get("/", requireAuth, listMilkTransactions);
router.get("/requests", requireAuth, requireAdminOrSuperAdmin, listMilkRequests);
router.get("/install-requests", requireAuth, requireAdminOrSuperAdmin, listInstallRequests);
router.get("/unpaid", requireAuth, getUnpaidMilkTransactions);
router.post("/sale", requireAuth, createMilkSale);
router.post("/quick-sale", requireAuth, createQuickSale);
router.post("/purchase", requireAuth, createMilkPurchase);
router.post("/install-request", createInstallRequest);
router.patch("/:id", requireAuth, updateMilkTransaction);
router.delete("/:id", requireAuth, deleteMilkTransactionRecord);

module.exports = { router };

