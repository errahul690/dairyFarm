const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  listPayments,
  createPaymentRecord,
  getPayment,
  updatePaymentRecord,
  deletePaymentRecord,
  listSettlements,
  createSettlementRecord,
  downloadClearedStatementPdf,
} = require("../controllers/payments.controller");

const router = Router();

// GET /payments - List all payments (with optional filters)
router.get("/", requireAuth, listPayments);

// GET /payments/settlements - List all settlements (for balance reset)
router.get("/settlements", requireAuth, listSettlements);

// POST /payments/settle - Record return/settlement (zero balance, new records start)
router.post("/settle", requireAuth, createSettlementRecord);
// GET /payments/settle - Debug: confirm route is registered (returns 405, use POST)
router.get("/settle", (_req, res) => {
  res.status(405).json({ error: "Method not allowed", message: "Use POST /payments/settle to create settlement" });
});

// GET /payments/statement/cleared/pdf - Download cleared/settled statement as PDF
router.get("/statement/cleared/pdf", requireAuth, downloadClearedStatementPdf);

// POST /payments - Create a new payment
router.post("/", requireAuth, createPaymentRecord);

// GET /payments/:id - Get a specific payment
router.get("/:id", requireAuth, getPayment);

// PATCH /payments/:id - Update a payment
router.patch("/:id", requireAuth, updatePaymentRecord);

// DELETE /payments/:id - Delete a payment
router.delete("/:id", requireAuth, deletePaymentRecord);

module.exports = { router };

