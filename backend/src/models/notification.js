const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["milk_request"],
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    buyerName: { type: String, trim: true },
    buyerPhone: { type: String, trim: true },
    quantity: { type: Number },
    milkTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "MilkTransaction" },
  },
  forRole: {
    type: Number,
    default: 0,
    required: false,
  },
  read: {
    type: Boolean,
    default: false,
    required: false,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: false },
});

NotificationSchema.index({ forRole: 1, read: 1 });
NotificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model("Notification", NotificationSchema);

async function createNotification({ type, message, data = {}, forRole = 0 }) {
  const doc = new Notification({ type, message, data, forRole });
  return await doc.save();
}

async function getNotifications(forRole = 0, { unreadOnly = false, limit = 50 } = {}) {
  const query = { forRole };
  if (unreadOnly) query.read = false;
  return await Notification.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

async function markNotificationRead(id) {
  return await Notification.findByIdAndUpdate(id, { read: true }, { new: true });
}

async function markAllNotificationsRead(forRole = 0) {
  const result = await Notification.updateMany({ forRole, read: false }, { read: true });
  return result;
}

async function getUnreadCount(forRole = 0) {
  return await Notification.countDocuments({ forRole, read: false });
}

module.exports = {
  Notification,
  createNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
};
