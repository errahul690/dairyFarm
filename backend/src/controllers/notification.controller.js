const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
} = require("../models");

const ADMIN_ROLE = 0;

const listNotifications = async (req, res) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const notifications = await getNotifications(ADMIN_ROLE, { unreadOnly, limit });
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

const getNotificationUnreadCount = async (req, res) => {
  try {
    const count = await getUnreadCount(ADMIN_ROLE);
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get unread count" });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await markNotificationRead(id);
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    return res.json(notification);
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark notification read" });
  }
};

const markAllRead = async (req, res) => {
  try {
    await markAllNotificationsRead(ADMIN_ROLE);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark all read" });
  }
};

module.exports = {
  listNotifications,
  getNotificationUnreadCount,
  markRead,
  markAllRead,
};
