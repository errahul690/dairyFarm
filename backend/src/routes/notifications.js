const { Router } = require("express");
const { requireAuth, requireAdminOrSuperAdmin } = require("../middleware/auth");
const {
  listNotifications,
  getNotificationUnreadCount,
  markRead,
  markAllRead,
} = require("../controllers/notification.controller");

const router = Router();

router.get("/", requireAuth, requireAdminOrSuperAdmin, listNotifications);
router.get("/unread-count", requireAuth, requireAdminOrSuperAdmin, getNotificationUnreadCount);
router.patch("/read-all", requireAuth, requireAdminOrSuperAdmin, markAllRead);
router.patch("/:id/read", requireAuth, requireAdminOrSuperAdmin, markRead);

module.exports = { router };
