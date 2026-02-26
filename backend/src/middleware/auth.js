const { verifyToken, extractTokenFromHeader } = require("../utils/jwt");

function requireAuth(req, res, next) {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }
    
    const decoded = verifyToken(token);
    
    req.user = decoded;
    
    return next();
  } catch (error) {
    if (error.message === "Token expired") {
      return res.status(401).json({ error: "Token expired" });
    }
    if (error.message === "Invalid token") {
      return res.status(401).json({ error: "Invalid token" });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/** Only super_admin (0) and admin (1) can proceed */
function requireAdminOrSuperAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 0 && role !== 1) {
    return res.status(403).json({ error: "Access denied. Only admin or super admin can perform this action." });
  }
  return next();
}

module.exports = { requireAuth, requireAdminOrSuperAdmin };

