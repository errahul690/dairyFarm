/**
 * Email – sab config se (.env via config.js)
 * .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const nodemailer = require('nodemailer');
const config = require('../config');

async function getTransporter() {
  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, nodeEnv, useEthereal } = config;
  if (smtpHost && smtpUser && smtpPass && smtpUser !== 'your_email@example.com') {
    const port = smtpPort || 587;
    const isGmail = String(smtpHost).toLowerCase().includes('gmail');
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
        ...(isGmail && port === 587 ? { secure: false, requireTLS: true } : {}),
      }),
      from: smtpFrom || smtpUser,
    };
  }
  if (nodeEnv !== 'production' || useEthereal) {
    const testAccount = await nodemailer.createTestAccount();
    return {
      transporter: nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      }),
      from: testAccount.user,
      isEthereal: true,
    };
  }
  return null;
}

async function sendOTPEmail(toEmail, otp) {
  if (!toEmail || !String(toEmail).trim()) return { sent: false };
  const transport = await getTransporter();
  if (!transport) return { sent: false };
  const { transporter, from, isEthereal } = transport;
  try {
    const info = await transporter.sendMail({
      from: `"HiTech Dairy Farm" <${from}>`,
      to: toEmail.trim(),
      subject: 'Password Reset OTP',
      text: `Your OTP is: ${otp}. Valid for 10 minutes.`,
      html: `<p>Your OTP is: <strong>${otp}</strong>. Valid for 10 minutes.</p>`,
    });
    if (isEthereal && info.messageId) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) return { sent: true, previewUrl };
    }
    return { sent: true };
  } catch (err) {
    console.error('[Email]', err.message);
    return { sent: false };
  }
}

module.exports = { sendOTPEmail };