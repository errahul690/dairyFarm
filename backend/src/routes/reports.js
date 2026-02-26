const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  getProfitLoss,
  getDashboardSummary,
  getConsumerConsumptionMonthly,
  downloadConsumerConsumptionExcel,
  downloadConsumerConsumptionPdf,
  downloadBuyerConsumptionCsv
} = require("../controllers/reports.controller");

const router = Router();

router.get("/profit-loss", requireAuth, getProfitLoss);
router.get("/dashboard-summary", requireAuth, getDashboardSummary);
router.get("/consumer-consumption-monthly", requireAuth, getConsumerConsumptionMonthly);
router.get("/consumer-consumption-monthly/export/excel", requireAuth, downloadConsumerConsumptionExcel);
router.get("/consumer-consumption-monthly/export/pdf", requireAuth, downloadConsumerConsumptionPdf);
router.get("/buyer-consumption/export", requireAuth, downloadBuyerConsumptionCsv);

module.exports = { router };

