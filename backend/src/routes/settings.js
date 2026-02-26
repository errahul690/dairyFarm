const { Router } = require("express");
const { requireAuth, requireAdminOrSuperAdmin } = require("../middleware/auth");
const { getUpi, updateUpi } = require("../controllers/settings.controller");

const router = Router();

router.get("/upi", requireAuth, getUpi);
router.patch("/upi", requireAuth, requireAdminOrSuperAdmin, updateUpi);

module.exports = { router };
