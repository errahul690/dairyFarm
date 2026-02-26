const crypto = require("crypto");
const axios = require("axios");
const { addUser, UserRoles, findUserByEmail, findUserByMobile, addBuyer, addSeller, updateUserPassword } = require("../models");
const { validateSignup, validateLogin, validateForgotPassword, validateResetPassword, formatValidationErrors } = require("../utils/validators");
const { generateToken } = require("../utils/jwt");
const { storeOTPForUser, verifyOTP } = require("../utils/otpStore");
const { sendOTP } = require("../services/smsService");
const { sendOTPEmail } = require("../services/emailService");
const msg91Service = require("../services/msg91Service");
const config = require("../config");

const login = async (req, res) => {
  const validation = validateLogin(req.body);
  if (!validation.success) {
    return res.status(400).json(formatValidationErrors(validation.errors));
  }
  
  const { emailOrMobile, password } = validation.data;
  
  // Check if it's email or mobile number
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  const isMobile = /^[0-9]{10}$/.test(emailOrMobile);
  
  if (!isEmail && !isMobile) {
    return res.status(400).json({ error: "Invalid email or mobile number format" });
  }
  
  try {
    // Find user by email or mobile
    let user = null;
    if (isEmail) {
      user = await findUserByEmail(emailOrMobile.toLowerCase());
    } else {
      user = await findUserByMobile(emailOrMobile);
    }
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Verify password hash
    const [salt, hash] = user.passwordHash.split(':');
    if (!salt || !hash) {
      return res.status(500).json({ error: "Invalid password format" });
    }
    
    const inputHash = crypto.scryptSync(password, salt, 64).toString("hex");
    if (inputHash !== hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Generate JWT token with user data
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      mobile: user.mobile,
      name: user.name,
      role: user.role,
    });
    
    return res.json({ 
      token, 
      user: { 
        id: user._id.toString(), 
        name: user.name, 
        email: user.email,
        mobile: user.mobile,
        role: user.role
      } 
    });
  } catch (error) {
    return res.status(500).json({ error: "Login failed" });
  }
};

const signup = async (req, res) => {
  // Validate request data using helper
  const validation = validateSignup(req.body);
  if (!validation.success) {
    return res.status(400).json(formatValidationErrors(validation.errors));
  }
  
  const validatedData = validation.data;

  // Hash password (salt + scrypt)
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(validatedData.password, salt, 64).toString("hex");
  const passwordHash = `${salt}:${hash}`;

  try {
    // Use provided role or default to CONSUMER (2)
    const userRole = validatedData.role !== undefined ? validatedData.role : UserRoles.CONSUMER;
    
    const emailForUser = (validatedData.email && String(validatedData.email).trim())
      ? String(validatedData.email).trim().toLowerCase()
      : "";
    const created = await addUser({
      name: validatedData.name,
      email: emailForUser,
      mobile: validatedData.mobile.trim(),
      gender: validatedData.gender,
      address: validatedData.address?.trim(),
      role: userRole,
      passwordHash,
      isActive: true,
    });

    console.log(`[auth] New user created:`, {
      _id: created._id,
      name: created.name,
      mobile: created.mobile,
    });

    // If user is a buyer (CONSUMER role), create a buyer record
    if (userRole === UserRoles.CONSUMER && created._id) {
      try {
        // Convert _id to string if it's ObjectId, to ensure proper handling
        const userId = created._id?.toString ? created._id.toString() : String(created._id);
        
        console.log('[auth] Attempting to create buyer record for user:', {
          userId: userId,
          userIdType: typeof created._id,
          userIdString: userId,
          name: created.name,
          quantity: validatedData.dailyMilkQuantity,
          rate: validatedData.milkFixedPrice,
        });
        
        const buyer = await addBuyer({
          userId: userId,
          name: created.name,
          quantity: validatedData.dailyMilkQuantity,
          rate: validatedData.milkFixedPrice,
          milkSource: (validatedData.milkSource && ['cow', 'buffalo', 'sheep', 'goat'].includes(validatedData.milkSource))
            ? validatedData.milkSource
            : 'cow',
        });
        
        console.log(`[auth] Buyer record created successfully:`, {
          _id: buyer._id,
          userId: buyer.userId,
          name: buyer.name,
          quantity: buyer.quantity,
          rate: buyer.rate,
        });
      } catch (buyerError) {
        // Log error but don't fail the signup if buyer creation fails
        console.error('[auth] Failed to create buyer record:', {
          error: buyerError?.message || buyerError,
          stack: buyerError?.stack,
          userId: created._id?.toString ? created._id.toString() : String(created._id),
          userIdType: typeof created._id,
          fullError: JSON.stringify(buyerError, Object.getOwnPropertyNames(buyerError)),
        });
      }
    } else {
      console.log('[auth] Skipping buyer creation:', {
        userRole,
        isConsumer: userRole === UserRoles.CONSUMER,
        hasId: !!created._id,
        _id: created._id?.toString ? created._id.toString() : String(created._id),
      });
    }

    // If user is a seller (SELLER role), create a seller record
    if (userRole === UserRoles.SELLER && created._id) {
      try {
        // Convert _id to string if it's ObjectId, to ensure proper handling
        const userId = created._id?.toString ? created._id.toString() : String(created._id);
        
        console.log('[auth] Attempting to create seller record for user:', {
          userId: userId,
          userIdType: typeof created._id,
          userIdString: userId,
          name: created.name,
          quantity: validatedData.dailyMilkQuantity,
          rate: validatedData.milkFixedPrice,
        });
        
        const seller = await addSeller({
          userId: userId, // Pass as string, addSeller will convert to ObjectId
          name: created.name,
          quantity: validatedData.dailyMilkQuantity,
          rate: validatedData.milkFixedPrice,
        });
        
        console.log(`[auth] Seller record created successfully:`, {
          _id: seller._id,
          userId: seller.userId,
          name: seller.name,
          quantity: seller.quantity,
          rate: seller.rate,
        });
      } catch (sellerError) {
        // Log error but don't fail the signup if seller creation fails
        console.error('[auth] Failed to create seller record:', {
          error: sellerError?.message || sellerError,
          stack: sellerError?.stack,
          userId: created._id?.toString ? created._id.toString() : String(created._id),
          userIdType: typeof created._id,
          fullError: JSON.stringify(sellerError, Object.getOwnPropertyNames(sellerError)),
        });
      }
    } else {
      console.log('[auth] Skipping seller creation:', {
        userRole,
        isSeller: userRole === UserRoles.SELLER,
        hasId: !!created._id,
        _id: created._id?.toString ? created._id.toString() : String(created._id),
      });
    }

    // Convert Mongoose document to JSON (will use toJSON transform)
    const userJson = created.toJSON ? created.toJSON() : JSON.parse(JSON.stringify(created));
    // Remove passwordHash if still present
    const { passwordHash: _ph, ...safe } = userJson;
    return res.status(201).json(safe);
  } catch (e) {
    console.error("[auth] Signup error:", {
      message: e?.message,
      stack: e?.stack,
      name: e?.name,
      code: e?.code,
      fullError: e
    });
    
    const msg = typeof e?.message === "string" ? e.message : "Unable to create user";
    
    // Handle specific MongoDB errors
    if (e?.code === 11000) {
      // Duplicate key error
      const field = e?.keyPattern ? Object.keys(e.keyPattern)[0] : "field";
      return res.status(409).json({ 
        error: `${field} already in use`,
        message: `This ${field} is already registered`
      });
    }
    
    // Handle MongoDB authentication errors
    if (msg.includes("authentication failed") || msg.includes("bad auth")) {
      console.error("[auth] MongoDB authentication error - check database credentials");
      return res.status(500).json({ 
        error: "Database connection error",
        message: "Unable to connect to database. Please check server configuration."
      });
    }
    
    const status = /already in use/i.test(msg) ? 409 : 500;
    return res.status(status).json({ error: msg });
  }
};

const forgotPassword = async (req, res) => {
  const validation = validateForgotPassword(req.body);
  if (!validation.success) {
    return res.status(400).json(formatValidationErrors(validation.errors));
  }
  
  const { emailOrMobile } = validation.data;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  
  try {
    const user = isEmail
      ? await findUserByEmail(emailOrMobile)
      : await findUserByMobile(emailOrMobile);
    
    if (!user) {
      return res.status(404).json({ error: "User not found. This email or mobile is not registered." });
    }
    
    const mobile = user.mobile;
    const email = (user.email && String(user.email).trim()) || null;

    if (msg91Service.isMsg91OtpConfigured()) {
      const result = await msg91Service.sendOtp(mobile);
      if (result.success) {
        console.log(`[auth/forgot-password] ✅ MSG91 OTP sent to +91${mobile}`);
        return res.json({ message: "OTP has been sent to your registered mobile number." });
      }
      console.error(`[auth/forgot-password] MSG91 OTP send failed:`, result.message);
      return res.status(500).json({ error: result.message || "Failed to send OTP." });
    }

    const userId = user._id.toString();
    const otp = storeOTPForUser(mobile, email, userId);
    const emailSent = email ? (await sendOTPEmail(email, otp)).sent : false;
    const smsSent = await sendOTP(mobile, otp);
    const toEmail = emailSent ? " registered email" : "";
    const toMobile = smsSent ? " mobile" : "";
    const channels = [toEmail, toMobile].filter(Boolean).join(" and ") || "registered email or mobile";
    return res.json({
      message: `OTP has been sent to your ${channels}. Check your inbox and SMS.`
    });
  } catch (error) {
    console.error("[auth/forgot-password] Error:", error);
    return res.status(500).json({ error: "Failed to process request" });
  }
};

const resetPassword = async (req, res) => {
  const validation = validateResetPassword(req.body);
  if (!validation.success) {
    return res.status(400).json(formatValidationErrors(validation.errors));
  }
  
  const { emailOrMobile, otp, newPassword } = validation.data;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrMobile);
  
  try {

    console.log(otp, 'otp', config.masterOtp, 'config.masterOtp');
    const isMasterOTP = otp.trim() === config.masterOtp;
    
    const user = isEmail
      ? await findUserByEmail(emailOrMobile)
      : await findUserByMobile(emailOrMobile);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (isMasterOTP) {
      console.log(`[auth/reset-password] Master OTP used for ${isEmail ? 'email' : 'mobile'}`);
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(newPassword, salt, 64).toString("hex");
      const passwordHash = `${salt}:${hash}`;
      await updateUserPassword(user._id, passwordHash);
      return res.json({ message: "Password reset successful. Please login with your new password." });
    }
    
    // MSG91 OTP verify (document style)
    if (msg91Service.isMsg91OtpConfigured()) {
      const verifyResult = await msg91Service.verifyOtp(user.mobile, otp);
      if (verifyResult.success) {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto.scryptSync(newPassword, salt, 64).toString("hex");
        const passwordHash = `${salt}:${hash}`;
        await updateUserPassword(user._id, passwordHash);
        console.log(`[auth/reset-password] Password reset successful (MSG91 verify)`);
        return res.json({ message: "Password reset successful. Please login with your new password." });
      }
      return res.status(400).json({ error: verifyResult.message || "Invalid OTP" });
    }
    
    // Fallback: in-memory OTP verification
    const otpResult = verifyOTP(emailOrMobile, otp);
    if (!otpResult.valid) {
      return res.status(400).json({ error: otpResult.error });
    }
    const { User } = require("../models");
    const userByOtp = await User.findById(otpResult.userId);
    if (!userByOtp) {
      return res.status(404).json({ error: "User not found" });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(newPassword, salt, 64).toString("hex");
    const passwordHash = `${salt}:${hash}`;
    await updateUserPassword(userByOtp._id, passwordHash);
    console.log(`[auth/reset-password] Password reset successful`);
    return res.json({ message: "Password reset successful. Please login with your new password." });
  } catch (error) {
    console.error("[auth/reset-password] Error:", error);
    return res.status(500).json({ error: "Failed to reset password" });
  }
};

const verifyOTPController = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    // Validate inputs
    if (!mobile || !otp) {
      return res.status(400).json({
        status: false,
        message: 'Mobile number and OTP are required'
      });
    }

    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({
        status: false,
        message: 'Please provide a valid 10-digit mobile number'
      });
    }

    const isMasterOTP = otp.trim() === config.masterOtp;

    let otpValid = false;

    if (isMasterOTP) {
      // Master OTP: bypass verification
      otpValid = true;
      console.log(`[auth/verify-otp] Master OTP used for mobile ${mobile}`);
    } else if (msg91Service.isMsg91OtpConfigured()) {
      const verifyResult = await msg91Service.verifyOtp(mobile, otp);
      otpValid = verifyResult.success;
      if (!otpValid) {
        return res.status(400).json({
          status: false,
          message: verifyResult.message || 'Invalid OTP. Please try again.'
        });
      }
      console.log('[auth/verify-otp] MSG91 OTP verified successfully');
    } else {
      return res.status(500).json({
        status: false,
        message: 'OTP verification not configured (AUTH_KEY / MSG91)'
      });
    }

    if (!otpValid) {
      return res.status(400).json({
        status: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // Find user by mobile
    const user = await findUserByMobile(mobile);
    
    if (!user) {
      return res.status(404).json({
        status: false,
        message: 'User not found'
      });
    }

    // Check if user is active
    if (user.isActive === false) {
      return res.status(403).json({
        status: false,
        message: 'Your account has been disabled'
      });
    }

    // Generate authentication token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      mobile: user.mobile,
      name: user.name,
      role: user.role,
    });

    // Prepare user data (exclude password hash)
    const userObj = user.toObject ? user.toObject() : user;
    const { passwordHash, ...userData } = userObj;
    if (userData._id) {
      userData._id = userData._id.toString();
    }

    return res.status(200).json({
      status: true,
      message: 'Login successful',
      data: {
        user: userData,
        token
      }
    });

  } catch (err) {
    console.error('[auth/verify-otp] Error:', err);
    return res.status(500).json({
      status: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};

/** Resend OTP (MSG91 document style) – POST body: { emailOrMobile } */
const resendOtp = async (req, res) => {
  const { emailOrMobile } = req.body || {};
  if (!emailOrMobile || !String(emailOrMobile).trim()) {
    return res.status(400).json({ error: 'Email or mobile is required' });
  }
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(emailOrMobile).trim());
  try {
    const user = isEmail
      ? await findUserByEmail(String(emailOrMobile).trim().toLowerCase())
      : await findUserByMobile(String(emailOrMobile).trim());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!msg91Service.isMsg91OtpConfigured()) {
      return res.status(400).json({ error: 'Resend OTP is only available when MSG91 OTP is configured (AUTH_KEY, TEMPLATE_ID, MYPIE_MSG91_URL)' });
    }
    const result = await msg91Service.resendOtp(user.mobile);
    if (result.success) {
      return res.json({ message: 'OTP resend successfully.' });
    }
    return res.status(400).json({ error: result.message || 'Resend failed' });
  } catch (err) {
    console.error('[auth/resend-otp] Error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP' });
  }
};

module.exports = { login, signup, forgotPassword, resetPassword, verifyOTP: verifyOTPController, resendOtp };

