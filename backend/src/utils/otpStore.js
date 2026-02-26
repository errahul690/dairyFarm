/**
 * OTP Store - In-memory storage for password reset OTPs
 * In production, use Redis or database for distributed systems
 */

// Store: key (email or mobile) -> { otp, expiresAt, userId, keys: [mobile, email?] }
const otpStore = new Map();

// OTP expiry time: 10 minutes
const OTP_EXPIRY_MS = 10 * 60 * 1000;

/**
 * Generate a 4-digit OTP
 */
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Store OTP for a single key (email or mobile) - backward compatible
 */
function storeOTP(emailOrMobile, userId) {
  return storeOTPForUser(emailOrMobile, null, userId);
}

/**
 * Store OTP for user - under both mobile and email so reset works with either
 * @param {string} mobile - User's 10-digit mobile
 * @param {string|null} email - User's email (optional)
 * @param {string} userId - User id
 * @returns {string} generated 4-digit OTP
 */
function storeOTPForUser(mobile, email, userId) {
  const otp = generateOTP();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  const keys = [mobile];
  if (email && String(email).trim()) {
    keys.push(String(email).trim().toLowerCase());
  }
  const data = { otp, expiresAt, userId, keys };
  keys.forEach((k) => otpStore.set(k, data));
  cleanupExpiredOTPs();
  return otp;
}

/**
 * Verify OTP for email or mobile
 */
function verifyOTP(emailOrMobile, otp) {
  const stored = otpStore.get(emailOrMobile);
  
  if (!stored) {
    return { valid: false, error: "OTP not found or expired" };
  }
  
  if (Date.now() > stored.expiresAt) {
    if (stored.keys) stored.keys.forEach((k) => otpStore.delete(k));
    else otpStore.delete(emailOrMobile);
    return { valid: false, error: "OTP expired" };
  }
  
  if (stored.otp !== otp.trim()) {
    return { valid: false, error: "Invalid OTP" };
  }
  
  const userId = stored.userId;
  if (stored.keys) stored.keys.forEach((k) => otpStore.delete(k));
  else otpStore.delete(emailOrMobile);
  
  return { valid: true, userId };
}

/**
 * Clean up expired OTPs
 */
function cleanupExpiredOTPs() {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (now > value.expiresAt) {
      if (value.keys) value.keys.forEach((k) => otpStore.delete(k));
      else otpStore.delete(key);
    }
  }
}

/**
 * Get stored OTP (for development/testing - remove in production)
 */
function getStoredOTP(emailOrMobile) {
  const stored = otpStore.get(emailOrMobile);
  if (!stored) return null;
  if (Date.now() > stored.expiresAt) {
    if (stored.keys) stored.keys.forEach((k) => otpStore.delete(k));
    else otpStore.delete(emailOrMobile);
    return null;
  }
  return stored.otp;
}

/**
 * Get all stored OTPs (for debugging - development only)
 */
function getAllStoredOTPs() {
  const otps = [];
  const now = Date.now();
  for (const [mobile, data] of otpStore.entries()) {
    if (now <= data.expiresAt) {
      otps.push({
        mobile,
        otp: data.otp,
        expiresAt: new Date(data.expiresAt).toLocaleString(),
        userId: data.userId,
      });
    }
  }
  return otps;
}

module.exports = {
  storeOTP,
  storeOTPForUser,
  verifyOTP,
  getStoredOTP, // For development only
  getAllStoredOTPs, // For debugging - development only
};

