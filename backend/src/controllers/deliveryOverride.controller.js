const { getOverridesForDate, setOverride, removeOverride } = require("../models/deliveryOverride");

/**
 * GET /delivery-overrides?date=YYYY-MM-DD
 * Returns overrides for the given date. Role 2 (buyer) gets only their own.
 */
async function listOverrides(req, res) {
  try {
    const dateStr = (req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "Query param date required (YYYY-MM-DD)" });
    }
    let overrides = await getOverridesForDate(dateStr);
    if (req.user && req.user.role === 2 && req.user.mobile) {
      const mobile = String(req.user.mobile).trim();
      overrides = overrides.filter((o) => String(o.customerMobile).trim() === mobile);
    }
    return res.json(overrides);
  } catch (err) {
    console.error("[deliveryOverride] listOverrides:", err);
    return res.status(500).json({ error: "Failed to fetch overrides" });
  }
}

/**
 * POST /delivery-overrides
 * Body: { date: "YYYY-MM-DD", customerMobile: "10digits", type: "cancelled" | "added" }
 * Role 2 can only set for their own mobile (customerMobile must match or be omitted).
 */
async function createOverride(req, res) {
  try {
    const { date, customerMobile, type } = req.body || {};
    const dateStr = (date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "date required (YYYY-MM-DD)" });
    }
    if (!type || !["cancelled", "added"].includes(type)) {
      return res.status(400).json({ error: "type must be 'cancelled' or 'added'" });
    }
    const isBuyer = req.user && req.user.role === 2;
    const mobile = isBuyer
      ? String(req.user.mobile || "").trim()
      : String(customerMobile || "").trim();
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: "customerMobile required (10 digits). Buyers can only set for themselves." });
    }
    if (isBuyer && customerMobile && String(customerMobile).trim() !== mobile) {
      return res.status(403).json({ error: "You can only set override for your own number" });
    }
    const doc = await setOverride(dateStr, mobile, type);
    return res.status(201).json(doc);
  } catch (err) {
    console.error("[deliveryOverride] createOverride:", err);
    return res.status(500).json({ error: "Failed to set override" });
  }
}

/**
 * DELETE /delivery-overrides?date=YYYY-MM-DD&customerMobile=xxx&type=cancelled|added
 * Or body: { date, customerMobile, type }. Role 2 can only remove their own.
 */
async function deleteOverride(req, res) {
  try {
    const { date, customerMobile, type } = { ...req.query, ...req.body };
    const dateStr = (date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "date required (YYYY-MM-DD)" });
    }
    if (!type || !["cancelled", "added"].includes(type)) {
      return res.status(400).json({ error: "type must be 'cancelled' or 'added'" });
    }
    const isBuyer = req.user && req.user.role === 2;
    const mobile = isBuyer
      ? String(req.user.mobile || "").trim()
      : String(customerMobile || "").trim();
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: "customerMobile required (10 digits)" });
    }
    if (isBuyer && customerMobile && String(customerMobile).trim() !== mobile) {
      return res.status(403).json({ error: "You can only remove override for your own number" });
    }
    await removeOverride(dateStr, mobile, type);
    return res.json({ success: true });
  } catch (err) {
    console.error("[deliveryOverride] deleteOverride:", err);
    return res.status(500).json({ error: "Failed to remove override" });
  }
}

module.exports = {
  listOverrides,
  createOverride,
  deleteOverride,
};
