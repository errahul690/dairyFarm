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
}, {
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  toJSON: {
    transform(_, ret) {
      ret._id = ret._id.toString();
      return ret;
    },
  },
});

DeliveryOverrideSchema.index({ date: 1, customerMobile: 1, type: 1 }, { unique: true });

const DeliveryOverride = mongoose.model("DeliveryOverride", DeliveryOverrideSchema);

async function getOverridesForDate(dateStr) {
  const list = await DeliveryOverride.find({ date: dateStr });
  return list;
}

async function setOverride(dateStr, customerMobile, type) {
  const mobile = String(customerMobile).trim();
  const doc = await DeliveryOverride.findOneAndUpdate(
    { date: dateStr, customerMobile: mobile, type },
    { date: dateStr, customerMobile: mobile, type },
    { upsert: true, new: true }
  );
  return doc;
}

async function removeOverride(dateStr, customerMobile, type) {
  const mobile = String(customerMobile).trim();
  const result = await DeliveryOverride.deleteOne({ date: dateStr, customerMobile: mobile, type });
  return result;
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
