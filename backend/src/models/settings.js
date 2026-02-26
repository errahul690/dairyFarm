const mongoose = require("mongoose");
const QRCode = require("qrcode");

const AppSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "app" },
    upiId: { type: String, trim: true, default: "" },
    upiName: { type: String, trim: true, default: "Farm" },
    qrImageBase64: { type: String, default: null },
  },
  { timestamps: true }
);

const AppSettings = mongoose.model("AppSettings", AppSettingsSchema);

const SETTINGS_KEY = "app";

async function getUpiSettings() {
  let doc = await AppSettings.findOne({ key: SETTINGS_KEY });
  if (!doc) {
    doc = await AppSettings.create({ key: SETTINGS_KEY, upiId: "", upiName: "Farm" });
  }
  let qrImageBase64 = doc.qrImageBase64 || null;
  if (!qrImageBase64 && (doc.upiId || "").trim()) {
    qrImageBase64 = await generateUpiQrBase64(doc.upiId, doc.upiName);
    if (qrImageBase64) {
      await AppSettings.findOneAndUpdate(
        { key: SETTINGS_KEY },
        { $set: { qrImageBase64 } },
        { new: true }
      );
    }
  }
  return {
    upiId: doc.upiId || "",
    upiName: doc.upiName || "Farm",
    qrImageBase64: qrImageBase64,
  };
}

async function generateUpiQrBase64(upiId, upiName) {
  if (!upiId || !String(upiId).trim()) return null;
  const id = String(upiId).trim();
  const name = encodeURIComponent(String(upiName || "Farm").trim());
  const upiString = `upi://pay?pa=${encodeURIComponent(id)}&pn=${name}&cu=INR`;
  try {
    const dataUrl = await QRCode.toDataURL(upiString, { type: "image/png", width: 280, margin: 1 });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    return base64;
  } catch (err) {
    console.error("[settings] QR generate error:", err);
    return null;
  }
}

async function updateUpiSettings(upiId, upiName) {
  const trimmedId = upiId != null ? String(upiId).trim() : "";
  const trimmedName = upiName != null ? String(upiName).trim() || "Farm" : "Farm";
  let qrImageBase64 = null;
  if (trimmedId) {
    qrImageBase64 = await generateUpiQrBase64(trimmedId, trimmedName);
  }
  const doc = await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        upiId: trimmedId,
        upiName: trimmedName,
        qrImageBase64: qrImageBase64,
      },
    },
    { new: true, upsert: true }
  );
  return {
    upiId: doc.upiId || "",
    upiName: doc.upiName || "Farm",
    qrImageBase64: doc.qrImageBase64 || null,
  };
}

module.exports = {
  AppSettings,
  getUpiSettings,
  updateUpiSettings,
};
