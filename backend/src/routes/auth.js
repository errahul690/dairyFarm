const { Router } = require("express");
const { login, signup, forgotPassword, resetPassword, verifyOTP, resendOtp } = require("../controllers/auth.controller");

const router = Router();

router.post("/login", login);
router.post("/signup", signup);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOtp);

module.exports = { router };

