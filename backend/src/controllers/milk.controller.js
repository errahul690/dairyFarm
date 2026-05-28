const { z } = require("zod");
const {
  getAllMilkTransactions,
  getMilkRequests,
  addMilkTransaction,
  getMilkTransactionById,
  updateMilkTransaction: updateMilkTransactionModel,
  deleteMilkTransaction,
  getUnpaidMilkTransactions: getUnpaidMilkTransactionsModel,
  findUserByMobile,
  createPayment,
  createNotification,
  MilkTransaction,
  findBuyerByUserId,
} = require("../models");
const { rebuildBuyerBalanceAndMonthly } = require("../services/buyerBalance.service");

async function safeRebuildBuyerBalance(buyerIdOrUserId) {
  if (!buyerIdOrUserId) return;
  try {
    await rebuildBuyerBalanceAndMonthly(buyerIdOrUserId);
  } catch (e) {
    console.error("[milk] rebuild buyer balance failed:", e?.message || e);
  }
}

/** Start of today in India (IST). Returns midnight UTC on the IST calendar day so toISOString().slice(0,10) shows correct date (e.g. 24 Feb 07:30 IST → 2026-02-24). */
function getStartOfTodayIST() {
  const now = new Date();
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

/** Same instant style as getStartOfTodayIST for a calendar day YYYY-MM-DD (IST). */
function getStartOfDayISTFromYmd(ymd) {
  if (!ymd || typeof ymd !== "string") return null;
  const s = ymd.trim();
  // Accept plain YYYY-MM-DD or ISO datetime (first 10 chars); full ISO used to fail regex and fell back to "today".
  const dayPart = s.length >= 10 && s[4] === "-" && s[7] === "-" ? s.slice(0, 10) : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart)) return null;
  const [y, m, d] = dayPart.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

const milkTxSchema = z.object({
  date: z.string().datetime(),
  quantity: z.number().nonnegative(),
  pricePerLiter: z.number().nonnegative(),
  totalAmount: z.number().nonnegative(),
  buyer: z.string().optional(),
  buyerPhone: z.string().optional(),
  buyerId: z.string().optional(),
  seller: z.string().optional(),
  sellerPhone: z.string().optional(),
  sellerId: z.string().optional(),
  notes: z.string().optional(),
  fixedPrice: z.number().nonnegative().optional(),
  paymentType: z.enum(["cash", "credit"]).optional(),
  amountReceived: z.number().nonnegative().optional(),
  milkSource: z.enum(["cow", "buffalo", "sheep", "goat"]).optional(),
  deliveryShift: z.enum(["morning", "evening"]).optional()
});

const listMilkTransactions = async (req, res) => {
  try {
    const user = req.user;
    let mobileNumber;
    let userId;

    if (user && user.role === 2) {
      mobileNumber = user.mobile?.trim();
      userId = user.userId || user._id;
    }

    const parseDateParam = (value) => {
      if (!value) return null;
      const v = String(value).trim();
      if (!v) return null;
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
      return null;
    };

    const parseEndExclusive = (value) => {
      if (!value) return null;
      const v = String(value).trim();
      if (!v) return null;
      // If it's YYYY-MM-DD, treat it as inclusive end day by adding 1 day (exclusive end)
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [y, m, d] = v.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(v);
      return isNaN(dt.getTime()) ? null : dt;
    };

    const from = parseDateParam(req.query.from);
    const to = parseEndExclusive(req.query.to);
    const type = req.query.type ? String(req.query.type).trim().toLowerCase() : null;

    const requestedLimit = req.query.limit != null ? Number(req.query.limit) : null;
    const requestedSkip = req.query.skip != null ? Number(req.query.skip) : 0;
    // Sensible defaults: buyers get smaller pages; admins can request bigger.
    const defaultLimit = user && user.role === 2 ? 200 : 500;
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : defaultLimit;
    const skip = Number.isFinite(requestedSkip) ? requestedSkip : 0;

    const transactions = await getAllMilkTransactions(mobileNumber, null, userId, {
      from,
      to,
      type,
      limit,
      skip,
    });
    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch milk transactions" });
  }
};

/** Admin only: list milk requests from buyer app (requestSource === 'buyer_app') */
const listMilkRequests = async (req, res) => {
  try {
    const requests = await getMilkRequests();
    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch milk requests" });
  }
};

const createMilkSale = async (req, res) => {
  const parsed = milkTxSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const raw = parsed.data;
    const milkSource = (raw.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(String(raw.milkSource).toLowerCase()))
      ? String(raw.milkSource).toLowerCase()
      : "cow";
    const normalizedData = {
      ...raw,
      buyerPhone: raw.buyerPhone?.trim() || undefined,
      sellerPhone: raw.sellerPhone?.trim() || undefined,
      milkSource,
    };
    if (raw.buyerId) normalizedData.buyerId = raw.buyerId;
    else if (normalizedData.buyerPhone) {
      const buyerUser = await findUserByMobile(normalizedData.buyerPhone);
      if (buyerUser) normalizedData.buyerId = buyerUser._id;
    }
    const requestSource = req.user?.role === 2 ? "buyer_app" : "admin";
    const tx = await addMilkTransaction({ type: "sale", requestSource, ...normalizedData });

    if (requestSource === "buyer_app") {
      await createNotification({
        type: "milk_request",
        message: `${normalizedData.buyer || "Buyer"} requested ${(normalizedData.quantity || 0).toFixed(2)} L milk`,
        data: {
          buyerName: normalizedData.buyer,
          buyerPhone: normalizedData.buyerPhone,
          quantity: normalizedData.quantity,
          milkTransactionId: tx._id,
        },
        forRole: 0,
      });
    }

    const amountReceived = Number(normalizedData.amountReceived);
    const buyerPhone = normalizedData.buyerPhone;

    if (amountReceived > 0 && buyerPhone) {
      const buyerUser = await findUserByMobile(buyerPhone);
      if (buyerUser) {
        const payment = await createPayment({
          customerId: buyerUser._id,
          customerName: buyerUser.name || (normalizedData.buyer || "Buyer"),
          customerMobile: buyerPhone,
          amount: amountReceived,
          paymentDate: tx.date || new Date(),
          paymentType: "cash",
          paymentDirection: "from_buyer",
          milkTransactionIds: [tx._id],
          milkQuantity: tx.quantity || 0,
          notes: `Paid at milk sale · ${(tx.quantity || 0).toFixed(2)} L`,
        });

        await MilkTransaction.findByIdAndUpdate(tx._id, {
          $push: { paymentIds: payment._id },
        });
      }
    }

    if (tx?.buyerId) {
      await safeRebuildBuyerBalance(tx.buyerId);
    }

    return res.status(201).json(tx);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create milk sale" });
  }
};

const quickSaleSchema = z.object({
  buyerMobile: z.string().min(10).max(10).regex(/^[0-9]+$/),
  quantity: z.number().positive().optional(),
  pricePerLiter: z.number().nonnegative().optional(),
  milkSource: z.enum(["cow", "buffalo", "sheep", "goat"]).optional(),
  /** Optional sale calendar day YYYY-MM-DD (IST), or ISO string (first 10 chars used). Defaults to today. */
  date: z.string().optional(),
  deliveryShift: z.enum(["morning", "evening"]).optional(),
});

/**
 * Quick Sale: record today's delivery for a buyer using their set rate/quantity.
 * POST body: { buyerMobile } for "Delivered" (use buyer's deliveryItems or single quantity & rate),
 * or { buyerMobile, quantity?, pricePerLiter?, milkSource? } for "Custom Delivered".
 * When buyer has deliveryItems, "Delivered" creates one transaction per item.
 */
const createQuickSale = async (req, res) => {
  // Debug: helps confirm whether server is receiving and using requested calendar day.
  // Safe to keep in production (doesn't log token); can be removed later if noisy.
  console.log("[milk quick-sale] Incoming body:", {
    buyerMobile: req?.body?.buyerMobile,
    date: req?.body?.date,
    quantity: req?.body?.quantity,
    pricePerLiter: req?.body?.pricePerLiter,
    milkSource: req?.body?.milkSource,
    deliveryShift: req?.body?.deliveryShift,
  });

  const parsed = quickSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn("[milk quick-sale] Validation failed:", parsed.error.flatten());
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const buyerMobile = parsed.data.buyerMobile.trim();
  let quantity = parsed.data.quantity;
  let pricePerLiter = parsed.data.pricePerLiter;
  const bodyMilkSource = parsed.data.milkSource;

  try {
    const user = await findUserByMobile(buyerMobile);
    if (!user) return res.status(404).json({ error: "Buyer not found for this mobile number." });

    const buyer = await findBuyerByUserId(user._id);
    if (!buyer) return res.status(404).json({ error: "Buyer profile not found." });

    const rawDate = parsed.data.date;
    const saleDayFromBody = getStartOfDayISTFromYmd(rawDate);
    const saleDay = saleDayFromBody || getStartOfTodayIST();
    console.log("[milk quick-sale] Parsed:", {
      buyerMobile,
      rawDate,
      saleDayFromBody: saleDayFromBody ? saleDayFromBody.toISOString() : null,
      saleDayUsed: saleDay.toISOString(),
      usedFallbackToday: !saleDayFromBody,
    });
    if (!saleDayFromBody && rawDate != null && String(rawDate).trim() !== "") {
      console.warn("[milk quick-sale] Invalid date in body; using IST today:", { rawDate });
    }
    const buyerName = user.name || buyer.name;
    const saleDeliveryShift = parsed.data.deliveryShift === "evening" ? "evening" : "morning";

    /** Multi-line quick sale: per-shift lines when buyer is "both", else deliveryItems. */
    const shiftDeliveryLines = (b, shift) => {
      const ds = b.deliveryShift || "both";
      if (ds !== "both") {
        return Array.isArray(b.deliveryItems) && b.deliveryItems.length > 0 ? b.deliveryItems : null;
      }
      const prop = shift === "evening" ? "eveningDeliveryItems" : "morningDeliveryItems";
      const spec = b[prop];
      if (spec !== undefined && spec !== null) {
        return Array.isArray(spec) ? spec : null;
      }
      return Array.isArray(b.deliveryItems) && b.deliveryItems.length > 0 ? b.deliveryItems : null;
    };

    // "Delivered" (no custom qty/rate): use deliveryItems if set, else single quantity/rate/milkSource
    if ((quantity == null || quantity <= 0) && (pricePerLiter == null || pricePerLiter < 0)) {
      const items = shiftDeliveryLines(buyer, saleDeliveryShift);

      if (Array.isArray(items) && items.length === 0) {
        return res.status(400).json({
          error: `Set ${saleDeliveryShift} milk lines for this buyer (Buyers → edit → ${saleDeliveryShift} section).`,
        });
      }

      if (items && items.length > 0) {
        const transactions = [];
        for (const item of items) {
          const q = Number(item.quantity) || 0;
          const r = Number(item.rate) || 0;
          const src = (item.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(String(item.milkSource).toLowerCase()))
            ? String(item.milkSource).toLowerCase()
            : "cow";
          if (!q || !r) continue;
          const totalAmount = Math.round(q * r * 100) / 100;
          const payload = {
            date: saleDay.toISOString(),
            quantity: q,
            pricePerLiter: r,
            totalAmount,
            buyer: buyerName,
            buyerPhone: buyerMobile,
            buyerId: user._id,
            paymentType: "credit",
            notes: "Quick sale",
            milkSource: src,
            deliveryShift: saleDeliveryShift,
          };
          const tx = await addMilkTransaction({ type: "sale", ...payload });
          transactions.push(tx);
        }
        if (transactions.length === 0) {
          return res.status(400).json({
            error: "Buyer deliveryItems have no valid quantity/rate. Add at least one milk type with quantity and rate.",
          });
        }
        await safeRebuildBuyerBalance(user._id);
        console.log("[milk quick-sale] Saved delivered items:", {
          count: transactions.length,
          dateUsed: saleDay.toISOString(),
          dateYmd: saleDay.toISOString().slice(0, 10),
          buyerMobile,
        });
        return res.status(201).json({ transactions });
      }

      quantity = Number(buyer.quantity) || 0;
      pricePerLiter = Number(buyer.rate) || 0;
    }

    if (quantity == null || quantity <= 0) quantity = Number(buyer.quantity) || 0;
    if (pricePerLiter == null || pricePerLiter < 0) pricePerLiter = Number(buyer.rate) || 0;
    if (!quantity || !pricePerLiter) {
      return res.status(400).json({
        error: "Set buyer's daily quantity and rate (or delivery items) first, or pass quantity and pricePerLiter.",
      });
    }

    const totalAmount = Math.round(quantity * pricePerLiter * 100) / 100;
    const milkSource = (bodyMilkSource && ["cow", "buffalo", "sheep", "goat"].includes(bodyMilkSource))
      ? bodyMilkSource
      : (buyer.milkSource && ["cow", "buffalo", "sheep", "goat"].includes(String(buyer.milkSource).toLowerCase()))
        ? String(buyer.milkSource).toLowerCase()
        : "cow";
    const payload = {
      date: saleDay.toISOString(),
      quantity,
      pricePerLiter,
      totalAmount,
      buyer: buyerName,
      buyerPhone: buyerMobile,
      buyerId: user._id,
      paymentType: "credit",
      notes: "Quick sale",
      milkSource,
      deliveryShift: saleDeliveryShift,
    };

    const tx = await addMilkTransaction({ type: "sale", ...payload });
    if (tx?.buyerId) await safeRebuildBuyerBalance(tx.buyerId);
    console.log("[milk quick-sale] Saved single tx:", {
      txId: tx?._id?.toString?.() || tx?._id,
      dateUsed: saleDay.toISOString(),
      dateYmd: saleDay.toISOString().slice(0, 10),
      storedDate: tx?.date ? new Date(tx.date).toISOString() : null,
      buyerMobile,
    });
    return res.status(201).json(tx);
  } catch (error) {
    console.error("[milk quick-sale] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to create quick sale" });
  }
};

const createMilkPurchase = async (req, res) => {
  const parsed = milkTxSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const raw = parsed.data;
    const normalizedData = {
      ...raw,
      buyerPhone: raw.buyerPhone?.trim() || undefined,
      sellerPhone: raw.sellerPhone?.trim() || undefined,
    };
    if (raw.sellerId) normalizedData.sellerId = raw.sellerId;
    else if (normalizedData.sellerPhone) {
      const sellerUser = await findUserByMobile(normalizedData.sellerPhone);
      if (sellerUser) normalizedData.sellerId = sellerUser._id;
    }
    const tx = await addMilkTransaction({ type: "purchase", ...normalizedData });
    return res.status(201).json(tx);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create milk purchase" });
  }
};

const updateMilkTransaction = async (req, res) => {
  const { id } = req.params;
  
  console.log("[milk] Update request received:", { 
    id, 
    idType: typeof id,
    url: req.url,
    method: req.method,
    body: req.body 
  });
  
  if (!id) {
    console.error("[milk] No ID provided in request");
    return res.status(400).json({ error: "Transaction ID is required" });
  }

  const parsed = milkTxSchema.safeParse(req.body);
  
  if (!parsed.success) {
    console.error("[milk] Validation error:", parsed.error.flatten());
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  try {
    // Check if transaction exists
    const existingTx = await getMilkTransactionById(id);
    if (!existingTx) {
      console.log("[milk] Transaction not found:", id);
      return res.status(404).json({ error: "Transaction not found" });
    }

    console.log("[milk] Found transaction:", existingTx._id);

    // Check permissions - Consumers can only update their own transactions
    const user = req.user;
    if (user && user.role === 2) {
      const userMobile = user.mobile?.trim();
      const userId = user._id || user.userId;
      const isOwner =
        (existingTx.buyerPhone?.trim() === userMobile) ||
        (existingTx.sellerPhone?.trim() === userMobile) ||
        (existingTx.buyerId && existingTx.buyerId.toString() === (userId && userId.toString())) ||
        (existingTx.sellerId && existingTx.sellerId.toString() === (userId && userId.toString()));

      if (!isOwner) {
        return res.status(403).json({ error: "You can only update your own transactions" });
      }
    }

    // Normalize phone numbers (trim whitespace)
    const normalizedData = {
      ...parsed.data,
      buyerPhone: parsed.data.buyerPhone?.trim() || undefined,
      sellerPhone: parsed.data.sellerPhone?.trim() || undefined,
    };

    // Preserve the transaction type - don't update it
    const updatedTx = await updateMilkTransactionModel(id, normalizedData);
    
    if (!updatedTx) {
      console.error("[milk] Update returned null");
      return res.status(500).json({ error: "Failed to update transaction" });
    }
    
    console.log("[milk] Transaction updated successfully:", updatedTx._id);
    if (existingTx?.buyerId) await safeRebuildBuyerBalance(existingTx.buyerId);
    return res.json(updatedTx);
  } catch (error) {
    console.error("[milk] Error updating transaction:", error);
    console.error("[milk] Error stack:", error.stack);
    return res.status(500).json({ error: "Failed to update transaction", message: error.message });
  }
};

const deleteMilkTransactionRecord = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if transaction exists
    const existingTx = await getMilkTransactionById(id);
    if (!existingTx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Check permissions - Consumers can only delete their own transactions
    const user = req.user;
    if (user && user.role === 2) {
      const userMobile = user.mobile?.trim();
      const userId = user._id || user.userId;
      const isOwner =
        (existingTx.buyerPhone?.trim() === userMobile) ||
        (existingTx.sellerPhone?.trim() === userMobile) ||
        (existingTx.buyerId && existingTx.buyerId.toString() === (userId && userId.toString())) ||
        (existingTx.sellerId && existingTx.sellerId.toString() === (userId && userId.toString()));

      if (!isOwner) {
        return res.status(403).json({ error: "You can only delete your own transactions" });
      }
    }

    await deleteMilkTransaction(id);
    if (existingTx?.buyerId) await safeRebuildBuyerBalance(existingTx.buyerId);
    return res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("[milk] Error deleting transaction:", error);
    return res.status(500).json({ error: "Failed to delete transaction" });
  }
};

const getUnpaidMilkTransactions = async (req, res) => {
  try {
    const { customerMobile, customerId } = req.query;
    const user = req.user;
    
    // If user is Consumer (role 2), only show their own unpaid transactions
    let filterMobile = customerMobile;
    let filterCustomerId = customerId;
    
    if (user && user.role === 2) {
      filterMobile = user.mobile?.trim();
      filterCustomerId = user.userId || user.id;
    }
    
    if (!filterMobile && !filterCustomerId) {
      return res.status(400).json({ error: "customerMobile or customerId is required" });
    }
    
    const transactions = await getUnpaidMilkTransactionsModel(filterMobile, filterCustomerId);
    return res.json(transactions);
  } catch (error) {
    console.error("[milk] Error fetching unpaid transactions:", error);
    return res.status(500).json({ error: "Failed to fetch unpaid transactions" });
  }
};

module.exports = {
  listMilkTransactions,
  listMilkRequests,
  createMilkSale,
  createQuickSale,
  createMilkPurchase,
  updateMilkTransaction,
  deleteMilkTransactionRecord,
  getUnpaidMilkTransactions,
};

