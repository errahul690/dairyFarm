const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const { createCharaConsumption, createCharaPurchase, listCharaConsumptions, listCharaPurchases } = require("../controllers/chara.controller");

const router = Router();

router.get("/purchases", requireAuth, listCharaPurchases);
router.post("/purchases", requireAuth, createCharaPurchase);
router.get("/consumptions", requireAuth, listCharaConsumptions);
router.post("/consumptions", requireAuth, createCharaConsumption);

module.exports = { router };

