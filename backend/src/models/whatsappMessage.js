const mongoose = require("mongoose");

const whatsappMessageSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },
    from: { type: String, default: null },
    to: { type: String, required: true },
    message: { type: String, required: true },
    messageType: {
      type: String,
      enum: [
        "text",
        "template",
        "image",
        "video",
        "document",
        "audio",
        "voice",
        "sticker",
      ],
      default: "text",
    },
    templateName: { type: String, default: null },
    templateData: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["sending", "sent", "delivered", "read", "failed", "received"],
      default: "sent",
    },
    direction: {
      type: String,
      enum: ["outgoing", "incoming"],
      default: "outgoing",
    },
    whatsappMessageId: { type: String, default: null },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userName: { type: String, default: null },
  },
  { timestamps: true }
);

whatsappMessageSchema.index({ tenantId: 1, to: 1, sentAt: -1 });
whatsappMessageSchema.index({ from: 1, sentAt: -1 });

const WhatsAppMessage = mongoose.model("WhatsAppMessage", whatsappMessageSchema);

module.exports = { WhatsAppMessage };
