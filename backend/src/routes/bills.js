const { Router } = require("express");
const { requireAuth, requireAdminOrSuperAdmin } = require("../middleware/auth");
const { listBuyerBills } = require("../controllers/bills.controller");

const router = Router();

router.get("/buyer/:buyerId", requireAuth, requireAdminOrSuperAdmin, listBuyerBills);

module.exports = { router };
