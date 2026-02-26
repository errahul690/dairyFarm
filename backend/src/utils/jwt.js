const jwt = require("jsonwebtoken");
const config = require("../config");

if (!config.jwtSecret) throw new Error("JWT_SECRET not set in .env");
if (!config.jwtExpiresIn) throw new Error("JWT_EXPIRES_IN not set in .env");

function generateToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded payload
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    }
    throw new Error("Token verification failed");
  }
}

/**
 * Extract token from Authorization header
 * @param {string|undefined} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7); // Remove "Bearer " prefix
}

module.exports = {
  generateToken,
  verifyToken,
  extractTokenFromHeader,
};

