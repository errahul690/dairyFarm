const { getUpiSettings, updateUpiSettings } = require("../models/settings");

const getUpi = async (req, res) => {
  try {
    const settings = await getUpiSettings();
    return res.json(settings);
  } catch (error) {
    console.error("[settings] getUpi:", error);
    return res.status(500).json({ error: "Failed to fetch UPI settings" });
  }
};

const updateUpi = async (req, res) => {
  try {
    const { upiId, upiName } = req.body || {};
    const settings = await updateUpiSettings(upiId, upiName);
    return res.json(settings);
  } catch (error) {
    console.error("[settings] updateUpi:", error);
    return res.status(500).json({ error: "Failed to update UPI settings" });
  }
};

module.exports = { getUpi, updateUpi };
