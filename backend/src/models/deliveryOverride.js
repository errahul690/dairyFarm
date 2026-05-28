const mongoose = require("mongoose");

const DeliveryOverrideSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  customerMobile: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ["cancelled", "added"],
  },
  /** morning | evening = skip that shift only; both = whole day (default). */
  deliveryShift: {
    type: String,
    enum: ["morning", "evening", "both"],
    default: "both",
  },
}, {
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  toJSON: {
    transform(_, ret) {
      ret._id = ret._id.toString();
      return ret;
    },
  },
});

DeliveryOverrideSchema.index({ date: 1, customerMobile: 1, type: 1, deliveryShift: 1 }, { unique: true });

const DeliveryOverride = mongoose.model("DeliveryOverride", DeliveryOverrideSchema);

async function getOverridesForDate(dateStr) {
  const list = await DeliveryOverride.find({ date: dateStr });
  return list;
}

function normalizeDeliveryShift(deliveryShift) {
  if (deliveryShift === "morning" || deliveryShift === "evening") return deliveryShift;
  return "both";
}

async function setOverride(dateStr, customerMobile, type, deliveryShift) {
  const mobile = String(customerMobile).trim();
  const shift = normalizeDeliveryShift(deliveryShift);
  const doc = await DeliveryOverride.findOneAndUpdate(
    { date: dateStr, customerMobile: mobile, type, deliveryShift: shift },
    { date: dateStr, customerMobile: mobile, type, deliveryShift: shift },
    { upsert: true, new: true }
  );
  return doc;
}

async function removeOverride(dateStr, customerMobile, type, deliveryShift) {
  const mobile = String(customerMobile).trim();
  const shift = normalizeDeliveryShift(deliveryShift);
  const base = { date: dateStr, customerMobile: mobile, type };
  if (shift === "both") {
    return await DeliveryOverride.deleteOne({
      ...base,
      $or: [{ deliveryShift: "both" }, { deliveryShift: { $exists: false } }, { deliveryShift: null }],
    });
  }
  return await DeliveryOverride.deleteOne({ ...base, deliveryShift: shift });
}

async function deleteOverrideById(id) {
  return await DeliveryOverride.findByIdAndDelete(id);
}

module.exports = {
  DeliveryOverride,
  getOverridesForDate,
  setOverride,
  removeOverride,
  deleteOverrideById,
};
