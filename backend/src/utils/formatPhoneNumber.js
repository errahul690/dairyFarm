/**
 * Format phone for WhatsApp: with country code (e.g. +919876543210).
 * Indian 10-digit: adds 91.
 */
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  let cleaned = String(phoneNumber).replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (!/^\d+$/.test(cleaned)) return null;
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return "+" + "91" + cleaned;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return "+" + cleaned;
  }
  if (cleaned.length >= 8 && cleaned.length <= 15) return "+" + cleaned;
  return null;
}

module.exports = { formatPhoneNumber };
