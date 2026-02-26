const axios = require("axios");
const { WhatsAppMessage } = require("../models/whatsappMessage");
const { formatPhoneNumber } = require("../utils/formatPhoneNumber");

const WHATSAPP_API_URL =
  process.env.WHATSAPP_API_URL;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

async function handleIncomingMessages(messages, metadata) {
  for (const msg of messages) {
    let from = msg.from;
    if (!from.startsWith("+")) from = "+" + from;
    let messageText = "";
    if (msg.type === "text") messageText = msg.text?.body || "";
    else if (msg.type === "image") messageText = msg.image?.caption || "[Image]";
    else if (msg.type === "audio" || msg.type === "voice")
      messageText = "[Audio]";
    else if (msg.type === "document") messageText = "[Document]";
    else if (msg.type === "video") messageText = msg.video?.caption || "[Video]";
    else if (msg.type === "sticker") messageText = "[Sticker]";
    else messageText = `[${msg.type}]`;

    await WhatsAppMessage.create({
      from,
      to: metadata?.phone_number_id || "unknown",
      message: messageText,
      messageType: msg.type,
      whatsappMessageId: msg.id,
      status: "received",
      sentAt: new Date(parseInt(msg.timestamp, 10) * 1000),
      direction: "incoming",
      tenantId: null,
    });
  }
}

async function handleStatusUpdates(statuses) {
  for (const s of statuses) {
    const update = { status: s.status };
    if (s.status === "delivered") update.deliveredAt = new Date();
    if (s.status === "read") update.readAt = new Date();
    await WhatsAppMessage.findOneAndUpdate(
      { whatsappMessageId: s.id },
      { $set: update }
    );
  }
}

function webhookVerify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function webhookPost(req, res) {
  const body = req.body;
  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (value.messages) {
        await handleIncomingMessages(value.messages, value.metadata);
      }
      if (value.statuses) {
        await handleStatusUpdates(value.statuses);
      }
    }
  }
  return res.sendStatus(200);
}

async function sendMessage(req, res) {
  try {
    const { to, message, tenantId, userId, userName } = req.body;
    const formattedPhone = formatPhoneNumber(to);
    if (!formattedPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid phone number" });
    }

    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone.replace("+", ""),
      type: "text",
      text: { body: message },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const wamid = response.data?.messages?.[0]?.id;
    await WhatsAppMessage.create({
      tenantId: tenantId || null,
      to: formattedPhone,
      message,
      messageType: "text",
      status: "sent",
      direction: "outgoing",
      whatsappMessageId: wamid,
      userId: userId || null,
      userName: userName || null,
    });

    res.json({
      success: true,
      data: { messageId: wamid, to: formattedPhone, status: "sent" },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error.response?.data?.error?.message || "Failed to send message",
    });
  }
}

async function sendTemplate(req, res) {
  try {
    const { to, templateName, language = "en", components } = req.body;
    const formattedPhone = formatPhoneNumber(to);
    if (!formattedPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid phone number" });
    }

    const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone.replace("+", ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: components || [],
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const wamid = response.data?.messages?.[0]?.id;
    await WhatsAppMessage.create({
      tenantId: req.body.tenantId || null,
      to: formattedPhone,
      message: `[Template: ${templateName}]`,
      messageType: "template",
      templateName,
      status: "sent",
      direction: "outgoing",
      whatsappMessageId: wamid,
    });

    res.json({
      success: true,
      data: { messageId: wamid, to: formattedPhone },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error.response?.data?.error?.message || "Failed to send template",
    });
  }
}

async function getTemplates(req, res) {
  try {
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const accessToken = WHATSAPP_ACCESS_TOKEN;
    if (!businessAccountId || !accessToken) {
      return res
        .status(500)
        .json({ success: false, message: "WhatsApp not configured" });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${businessAccountId}/message_templates`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: "id,name,status,category,language,components" },
      }
    );

    res.json({
      success: true,
      data: response.data.data || [],
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message,
    });
  }
}

async function getChatHistory(req, res) {
  try {
    const phone = req.params.phone;
    const tenantId = req.query.tenantId;
    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid phone" });
    }

    const filter = tenantId
      ? {
          $or: [
            { tenantId, to: formattedPhone },
            { from: formattedPhone },
          ],
        }
      : { $or: [{ to: formattedPhone }, { from: formattedPhone }] };

    const messages = await WhatsAppMessage.find(filter)
      .sort({ sentAt: 1 })
      .lean();

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  webhookVerify,
  webhookPost,
  sendMessage,
  sendTemplate,
  getTemplates,
  getChatHistory,
};
