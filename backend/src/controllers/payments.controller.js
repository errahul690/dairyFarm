const { z } = require("zod");
const PDFDocument = require("pdfkit-table");
const { createPayment, getAllPayments, getPaymentById, updatePayment, deletePayment, getSettlementPayments } = require("../models/payments");
const { User } = require("../models/users");
const { getUnpaidMilkTransactions, getUnpaidMilkTransactionsForSeller, updateMilkTransactionPayment, MilkTransaction } = require("../models/milk");
const { Buyer } = require("../models/buyers");
const { rebuildBuyerBalanceAndMonthly } = require("../services/buyerBalance.service");
const paymentSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  customerName: z.string().min(1, "Customer name is required"),
  customerMobile: z.string().regex(/^[0-9]{10}$/, "Mobile must be exactly 10 digits"),
  amount: z.number().positive("Amount must be greater than 0"),
  paymentDate: z.string().datetime().optional(),
  paymentType: z.enum(["cash", "bank_transfer", "upi", "other"]).optional().default("cash"),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  // Optional: Link with specific milk transactions
  milkTransactionIds: z.array(z.string()).optional(),
  autoLinkMilk: z.boolean().optional().default(true),
  paymentDirection: z.enum(["from_buyer", "to_seller"]).optional().default("from_buyer"),
});

const listPayments = async (req, res) => {
  try {
    const { customerId, customerMobile, paymentDirection } = req.query;
    const user = req.user;
    let filterCustomerId = customerId;
    let filterCustomerMobile = customerMobile;
    if (user && user.role === 2) {
      filterCustomerId = user.userId || user.id;
    }
    const payments = await getAllPayments(filterCustomerId, filterCustomerMobile, paymentDirection || null);
    return res.json(payments);
  } catch (error) {
    console.error("[payments] Error fetching payments:", error);
    return res.status(500).json({ error: "Failed to fetch payments" });
  }
};

const createPaymentRecord = async (req, res) => {
  try {
    const validation = paymentSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validation.error.errors 
      });
    }

    const data = validation.data;
    
    // Verify customer exists
    const customer = await User.findById(data.customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const direction = data.paymentDirection || "from_buyer";
    const paymentData = {
      customerId: data.customerId,
      customerName: customer.name || data.customerName,
      customerMobile: customer.mobile || data.customerMobile,
      amount: data.amount,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
      paymentType: data.paymentType || "cash",
      notes: data.notes || "",
      referenceNumber: data.referenceNumber || "",
      milkTransactionIds: [],
      milkQuantity: 0,
      paymentDirection: direction,
    };

    const payment = await createPayment(paymentData);
    
    let linkedTransactions = [];
    let totalMilkQuantity = 0;
    let remainingAmount = data.amount;
    
    if (data.autoLinkMilk !== false) {
      const unpaidTransactions = direction === "to_seller"
        ? await getUnpaidMilkTransactionsForSeller(customer.mobile)
        : await getUnpaidMilkTransactions(customer.mobile, data.customerId);
      
      // Link transactions based on payment amount
      for (const milkTx of unpaidTransactions) {
        if (remainingAmount <= 0) break;
        
        const unpaidAmount = milkTx.totalAmount - (milkTx.paidAmount || 0);
        const unpaidQuantity = milkTx.quantity - (milkTx.paidQuantity || 0);
        
        if (unpaidAmount <= 0 || unpaidQuantity <= 0) continue;
        
        // Calculate how much of this transaction we can pay
        const amountToPay = Math.min(remainingAmount, unpaidAmount);
        const quantityToPay = (unpaidQuantity * amountToPay) / unpaidAmount;
        
        // Update milk transaction payment status
        await updateMilkTransactionPayment(
          milkTx._id,
          payment._id,
          amountToPay,
          quantityToPay
        );
        
        // Link with payment
        payment.milkTransactionIds.push(milkTx._id);
        totalMilkQuantity += quantityToPay;
        remainingAmount -= amountToPay;
        linkedTransactions.push({
          transactionId: milkTx._id,
          amount: amountToPay,
          quantity: quantityToPay,
        });
      }
      
      // Update payment with linked transactions
      payment.milkQuantity = totalMilkQuantity;
      await payment.save();
    }
    
    // Rebuild buyer balance/monthly for this customer (if they are a Buyer).
    try {
      const buyer = await Buyer.findOne({ userId: payment.customerId });
      if (buyer) rebuildBuyerBalanceAndMonthly(buyer._id).catch(() => {});
    } catch (_) {}
    const user = req.user;
    return res.status(201).json(payment);
  } catch (error) {
    console.error("[payments] Error creating payment:", error);
    return res.status(500).json({ error: "Failed to create payment" });
  }
};

const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(404).json({ error: "Payment not found" });
    }
    const payment = await getPaymentById(id);
    
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Check if user has permission to view this payment
    const user = req.user;
    if (user && user.role === 2) {
      // Consumer can only see their own payments
      const customerId = user.userId || user.id;
      if (payment.customerId.toString() !== customerId.toString()) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    return res.json(payment);
  } catch (error) {
    console.error("[payments] Error fetching payment:", error);
    return res.status(500).json({ error: "Failed to fetch payment" });
  }
};

const updatePaymentRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getPaymentById(id);
    
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Check permissions
    const user = req.user;
    if (user && user.role === 2) {
      return res.status(403).json({ error: "Consumers cannot update payments" });
    }

    const updates = {};
    if (req.body.amount !== undefined) updates.amount = req.body.amount;
    if (req.body.paymentDate !== undefined) updates.paymentDate = new Date(req.body.paymentDate);
    if (req.body.paymentType !== undefined) updates.paymentType = req.body.paymentType;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.referenceNumber !== undefined) updates.referenceNumber = req.body.referenceNumber;

    const updated = await updatePayment(id, updates);
    try {
      const buyer = await Buyer.findOne({ userId: payment.customerId });
      if (buyer) rebuildBuyerBalanceAndMonthly(buyer._id).catch(() => {});
    } catch (_) {}
    return res.json(updated);
  } catch (error) {
    console.error("[payments] Error updating payment:", error);
    return res.status(500).json({ error: "Failed to update payment" });
  }
};

const deletePaymentRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getPaymentById(id);
    
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Check permissions
    const user = req.user;
    if (user && user.role === 2) {
      return res.status(403).json({ error: "Consumers cannot delete payments" });
    }

    await deletePayment(id);
    try {
      const buyer = await Buyer.findOne({ userId: payment.customerId });
      if (buyer) rebuildBuyerBalanceAndMonthly(buyer._id).catch(() => {});
    } catch (_) {}
    return res.json({ message: "Payment deleted successfully" });
  } catch (error) {
    console.error("[payments] Error deleting payment:", error);
    return res.status(500).json({ error: "Failed to delete payment" });
  }
};

const listSettlements = async (req, res) => {
  try {
    const { paymentDirection } = req.query || {};
    const filter = {};
    if (paymentDirection != null && String(paymentDirection).trim() !== "") filter.paymentDirection = String(paymentDirection).trim();
    // Consumers (role 2) can only view their own settlement records.
    const user = req.user;
    if (user && user.role === 2) {
      const customerId = user.userId || user.id || user._id;
      const customerMobile = user.mobile ? String(user.mobile).trim() : null;
      if (customerId) filter.customerId = customerId;
      if (customerMobile) filter.customerMobile = customerMobile;
    }
    const payments = await getSettlementPayments(filter);
    const list = (payments || []).map((p) => ({
      _id: p._id && p._id.toString ? p._id.toString() : String(p._id),
      customerId: p.customerId && p.customerId.toString ? p.customerId.toString() : String(p.customerId),
      customerName: p.customerName || "",
      customerMobile: p.customerMobile || "",
      amountReturned: p.amount != null ? p.amount : 0,
      settledAt: p.paymentDate || new Date(),
      isSettlement: true,
    }));
    return res.json(list);
  } catch (error) {
    console.error("[payments] Error fetching settlements:", error);
    return res.status(500).json({ error: "Failed to fetch settlements" });
  }
};

const downloadClearedStatementPdf = async (req, res) => {
  try {
    const { customerMobile, customerId, paymentDirection } = req.query || {};
    const filter = {};
    if (customerMobile != null && String(customerMobile).trim() !== "") filter.customerMobile = String(customerMobile).trim();
    if (customerId != null && String(customerId).trim() !== "") filter.customerId = customerId;
    if (paymentDirection != null && String(paymentDirection).trim() !== "") filter.paymentDirection = String(paymentDirection).trim();
    const payments = await getSettlementPayments(filter);
    const rows = (payments || []).map((p) => [
      p.paymentDate ? new Date(p.paymentDate).toISOString().slice(0, 10) : "",
      (p.customerName || "").slice(0, 28),
      (p.customerMobile || "").slice(0, 12),
      (p.amount != null ? Number(p.amount) : 0).toFixed(2),
    ]);
    const isSingleCustomer = filter.customerMobile || filter.customerId;
    const customerLabel = rows.length > 0 ? (rows[0][1] || "").replace(/\s+/g, "-").slice(0, 20) : "customer";
    const filename = isSingleCustomer ? `cleared-statement-${customerLabel}.pdf` : "cleared-statement-all.pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    const title = isSingleCustomer ? `Cleared Statement - ${rows[0]?.[1] || "Customer"}` : "Cleared Statement (All)";
    doc.fontSize(16).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").text(`Generated on ${new Date().toISOString().slice(0, 10)} | Total records: ${rows.length}`, { align: "center" });
    doc.moveDown(1);
    if (rows.length === 0) {
      doc.fontSize(11).text("No cleared/settled records yet.");
    } else {
      const tableDivider = { horizontal: { width: 0.5 }, vertical: { width: 0.5 } };
      const table = {
        headers: ["Date", "Customer Name", "Mobile", "Amount Returned (₹)"],
        rows,
      };
      await doc.table(table, {
        columnsSize: [70, 120, 70, 80],
        divider: tableDivider,
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9),
        prepareRow: () => doc.font("Helvetica").fontSize(9),
      });
    }
    doc.end();
  } catch (error) {
    console.error("[payments] Error generating cleared statement PDF:", error);
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
};

const createSettlementRecord = async (req, res) => {
  try {
    const { customerId, customerName, customerMobile, amountReturned, notes, paymentDirection } = req.body || {};
    if (!customerId || !customerMobile || !customerName || amountReturned == null) {
      return res.status(400).json({ error: "customerId, customerName, customerMobile and amountReturned are required" });
    }
    const amount = Number(amountReturned);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: "amountReturned must be a non-negative number" });
    }
    const direction = paymentDirection === "to_seller" ? "to_seller" : "from_buyer";
    const payment = await createPayment({
      customerId,
      customerName: String(customerName).trim(),
      customerMobile: String(customerMobile).trim(),
      amount,
      paymentDate: new Date(),
      paymentType: "cash",
      notes: notes ? String(notes).trim() : "",
      isSettlement: true,
      paymentDirection: direction,
    });
    return res.status(201).json({
      _id: payment._id.toString(),
      customerId: payment.customerId.toString(),
      customerName: payment.customerName,
      customerMobile: payment.customerMobile,
      amountReturned: payment.amount,
      settledAt: payment.paymentDate,
      isSettlement: true,
    });
  } catch (error) {
    console.error("[payments] Error creating settlement:", error);
    return res.status(500).json({ error: "Failed to create settlement" });
  }
};

module.exports = {
  listPayments,
  createPaymentRecord,
  getPayment,
  updatePaymentRecord,
  deletePaymentRecord,
  listSettlements,
  createSettlementRecord,
  downloadClearedStatementPdf,
};

