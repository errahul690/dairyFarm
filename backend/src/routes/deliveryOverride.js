const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const { listOverrides, createOverride, deleteOverride } = require("../controllers/deliveryOverride.controller");

const router = Router();

router.get("/", requireAuth, listOverrides);
router.post("/", requireAuth, createOverride);
router.delete("/", requireAuth, deleteOverride);

module.exports = { router };
