/**
 * MSG91 – sab config se (.env via config.js)
 * v5/otp send, verify, resend + sendSms (flow)
 */
const axios = require('axios');
const config = require('../config');

const VERIFY_OTP_URL = 'https://control.msg91.com/api/verifyRequestOTP.php';
const RETRY_OTP_URL = 'https://api.msg91.com/api/v5/otp/retry';

async function sendOtp(mobile) {
  const auth = config.msg91AuthKey;
  const templateId = config.msg91TemplateId;
  let url = config.msg91OtpUrl;

  if (!auth) return { success: false, message: '.env: AUTH_KEY / MSG91_AUTH_KEY set karein' };

  const m = String(mobile).trim().replace(/^91/, '');
  if (m.length !== 10) return { success: false, message: 'Invalid 10-digit mobile' };

  if (url && url.includes('<<')) {
    url = url.replace('<<template>>', templateId || '').replace('<<mobile>>', m).replace('<<auth>>', auth);
  } else {
    url = `https://api.msg91.com/api/v5/otp?template_id=${templateId || ''}&mobile=91${m}&authkey=${auth}`;
  }

  try {
    const { data } = await axios.get(url);
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (res.type === 'success') return { success: true };
    return { success: false, message: res.message || 'OTP send failed' };
  } catch (err) {
    return { success: false, message: err.response?.data?.message || err.message };
  }
}

async function verifyOtp(mobile, otp) {
  if (!config.msg91AuthKey) return { success: false, message: 'AUTH_KEY not set' };
  const m = String(mobile).trim().replace(/^91/, '');
  const url = `${VERIFY_OTP_URL}?authkey=${config.msg91AuthKey}&mobile=91${m}&otp=${encodeURIComponent(otp.trim())}`;
  try {
    const { data } = await axios.get(url);
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (res.type === 'success' || res.type === 'status' || res.message === 'already_verified') return { success: true };
    return { success: false, message: res.message || 'Invalid OTP' };
  } catch (err) {
    return { success: false, message: err.response?.data?.message || err.message };
  }
}

async function resendOtp(mobile) {
  if (!config.msg91AuthKey) return { success: false, message: 'AUTH_KEY not set' };
  const m = String(mobile).trim().replace(/^91/, '');
  const url = `${RETRY_OTP_URL}?authkey=${config.msg91AuthKey}&mobile=91${m}`;
  try {
    const { data } = await axios.get(url);
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (res.type === 'success') return { success: true };
    return { success: false, message: res.message || 'Resend failed' };
  } catch (err) {
    return { success: false, message: err.response?.data?.message || err.message };
  }
}

async function sendSms(body) {
  if (!config.msg91AuthKey) return { success: false, message: 'MSG91 auth not set' };
  const url = config.msg91SmsUrl || 'https://api.msg91.com/api/v5/flow/';
  try {
    const { data } = await axios.post(url, body, {
      headers: { authkey: config.msg91AuthKey, 'content-type': 'application/json' },
    });
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (res.type === 'success' || (res.message && String(res.message).toLowerCase().includes('success'))) {
      return { success: true, data: res };
    }
    return { success: false, message: res.message || 'SMS failed' };
  } catch (err) {
    return { success: false, message: err.response?.data?.message || err.message };
  }
}

function isMsg91OtpConfigured() {
  return !!(config.msg91AuthKey && config.msg91TemplateId);
}

module.exports = { sendOtp, verifyOtp, resendOtp, sendSms, isMsg91OtpConfigured };