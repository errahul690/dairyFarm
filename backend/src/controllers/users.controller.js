const crypto = require("crypto");
const { getUsersByRole, addUser, updateUser: updateUserModel, User, UserRoles } = require("../models/users");
const { findBuyerByUserId, updateBuyer } = require("../models/buyers");

/**
 * Get users by role
 * GET /users?role=2
 */
const getUsers = async (req, res) => {
  try {
    const roleParam = req.query.role;
    
    if (!roleParam) {
      return res.status(400).json({ error: "Role parameter is required" });
    }

    const role = parseInt(roleParam, 10);
    
    // Allow roles: 0 (Super Admin), 1 (Admin), 2 (Consumer), 3 (Seller)
    if (isNaN(role) || (role !== 0 && role !== 1 && role !== 2 && role !== 3)) {
      return res.status(400).json({ error: "Invalid role. Must be 0, 1, 2, or 3" });
    }

    const users = await getUsersByRole(role);
    
    console.log(`[users] Controller: Found ${users.length} users with role ${role}`);
    
    // Convert Mongoose documents to plain objects and remove passwordHash
    const safeUsers = users.map((user) => {
      const userObj = user.toObject ? user.toObject() : user;
      const { passwordHash, ...safeUser } = userObj;
      // Ensure _id is a string
      if (safeUser._id) {
        safeUser._id = safeUser._id.toString();
      }
      // Log each user's data for debugging
      console.log(`[users] User data:`, {
        _id: safeUser._id,
        name: safeUser.name,
        mobile: safeUser.mobile,
        email: safeUser.email,
        role: safeUser.role
      });
      return safeUser;
    });

    console.log(`[users] Controller: Returning ${safeUsers.length} safe users`);
    return res.json(safeUsers);
  } catch (error) {
    console.error("[users] Error fetching users:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};

const updateUser = async (req, res) => {
  const userId = req.params.id;
  console.log("[users] PATCH /users/:id hit, userId:", userId);
  try {
    const body = req.body || {};
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === UserRoles.SUPER_ADMIN) {
      return res.status(403).json({ error: "Cannot modify super admin" });
    }
    if (req.user?.userId && req.user.userId === userId.toString()) {
      if (body.role !== undefined && body.role === UserRoles.CONSUMER) {
        return res.status(403).json({ error: "Cannot remove your own admin access" });
      }
      if (body.isActive === false) {
        return res.status(403).json({ error: "Cannot deactivate your own account" });
      }
    }
    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.mobile !== undefined) updates.mobile = body.mobile;
    if (body.address !== undefined) updates.address = body.address;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.role !== undefined) updates.role = body.role;
    await updateUserModel(userId, updates);
    // If consumer (buyer), update buyer record name/rate/quantity
    if (user.role === UserRoles.CONSUMER) {
      const buyer = await findBuyerByUserId(userId);
      if (buyer) {
        const buyerUpdates = {};
        if (body.name !== undefined) buyerUpdates.name = body.name.trim();
        if (body.milkFixedPrice !== undefined) buyerUpdates.rate = Number(body.milkFixedPrice);
        if (body.dailyMilkQuantity !== undefined) buyerUpdates.quantity = Number(body.dailyMilkQuantity);
        if (Object.keys(buyerUpdates).length > 0) {
          await updateBuyer(userId, buyerUpdates);
        }
      }
    }
    const updated = await User.findById(userId);
    const { passwordHash, ...safe } = updated.toObject();
    safe._id = safe._id.toString();
    return res.json(safe);
  } catch (error) {
    const msg = error.message || "Failed to update user";
    if (msg.includes("already in use") || msg.includes("Invalid mobile")) {
      return res.status(400).json({ error: msg });
    }
    console.error("[users] Error updating user:", error);
    return res.status(500).json({ error: "Failed to update user" });
  }
};

/**
 * Add Admin - Only admin/super_admin can create new admin
 * POST /users/admin
 * Body: { name, mobile, password, email?, address?, gender? }
 */
const addAdmin = async (req, res) => {
  try {
    const { name, mobile, password, email, address, gender } = req.body || {};
    if (!name || !mobile || !password) {
      return res.status(400).json({ error: "Name, mobile and password are required" });
    }
    const trimmedMobile = String(mobile).trim();
    if (!/^[0-9]{10}$/.test(trimmedMobile)) {
      return res.status(400).json({ error: "Mobile must be exactly 10 digits" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    const passwordHash = `${salt}:${hash}`;
    const created = await addUser({
      name: String(name).trim(),
      email: (email && String(email).trim()) || "",
      mobile: trimmedMobile,
      gender: ["male", "female", "other"].includes(gender) ? gender : undefined,
      address: (address && String(address).trim()) || undefined,
      role: UserRoles.ADMIN,
      passwordHash,
      isActive: true,
    });
    const { passwordHash: _, ...safe } = created.toObject();
    safe._id = safe._id.toString();
    return res.status(201).json(safe);
  } catch (error) {
    const msg = error.message || "Failed to create admin";
    if (msg.includes("already in use")) {
      return res.status(409).json({ error: msg });
    }
    console.error("[users] Error adding admin:", error);
    return res.status(500).json({ error: msg });
  }
};

module.exports = { getUsers, updateUser, addAdmin };

