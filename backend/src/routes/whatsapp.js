const { Router } = require("express");
const {
  webhookVerify,
  webhookPost,
  sendMessage,
  sendTemplate,
  getTemplates,
  getChatHistory,
} = require("../controllers/whatsapp.controller");

const router = Router();

// Webhook – no auth (Meta calls these)
router.get("/webhook", webhookVerify);
router.post("/webhook", webhookPost);

// Send & history (add auth middleware if needed)
router.post("/send-message", sendMessage);
router.post("/send-template", sendTemplate);
router.get("/templates", getTemplates);
router.get("/chat-history/:phone", getChatHistory);

module.exports = { router };
