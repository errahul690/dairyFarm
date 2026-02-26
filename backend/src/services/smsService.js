/**
 * SMS – sab config .env se (config.js)
 */
const axios = require('axios');
const config = require('../config');

async function sendViaMSG91Flow(mobile, otp, flowId, templateVariable) {
  const body = {
    flow_id: flowId,
    sender: config.msg91SenderId,
    recipients: [{ mobiles: `91${mobile}`, [templateVariable]: otp }],
  };
  const { data } = await axios.post(config.msg91SmsUrl, body, {
    headers: { authkey: config.msg91AuthKey, 'Content-Type': 'application/json' },
  });
  const res = typeof data === 'string' ? JSON.parse(data) : data;
  if (res.type === 'success' || (res.message && String(res.message).toLowerCase().includes('success'))) {
    return true;
  }
  throw new Error(res.message || 'MSG91 Flow error');
}

async function sendViaMSG91(mobile, otp) {
  if (!config.msg91AuthKey) {
    throw new Error('.env: MSG91_AUTH_KEY or AUTH_KEY set karein');
  }
  const authKey = config.msg91AuthKey;
  const senderId = config.msg91SenderId;
  const templateVar = config.msg91TemplateVariable;
  const expiry = config.msg91OtpExpiryMinutes;

  if (config.msg91OtpFlowId) {
    await sendViaMSG91Flow(mobile, otp, config.msg91OtpFlowId, templateVar);
    return true;
  }

  try {
    const params = {
      authkey: authKey,
      mobile: `91${mobile}`,
      sender: senderId,
      otp,
      otp_expiry: expiry,
      message: `Your OTP is ${otp}. Valid for ${expiry} min.`,
    };
    const { data } = await axios.get('https://control.msg91.com/api/sendotp.php', { params });
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (res.type === 'success') return true;
  } catch (e) {
    // ignore
  }

  if (config.msg91DltTemplateId) {
    const payload = {
      sender: senderId,
      route: '4',
      country: '91',
      sms: [{ message: `Your OTP is ${otp}. Valid for ${expiry} min.`, to: [`91${mobile}`] }],
      DLT_TE_ID: config.msg91DltTemplateId,
    };
    const { data } = await axios.post('https://api.msg91.com/api/v2/sendsms', payload, {
      headers: { authkey: authKey, 'Content-Type': 'application/json' },
    });
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (res.type === 'success' || (res.message && String(res.message).toLowerCase().includes('success'))) {
      return true;
    }
    throw new Error(res.message || 'MSG91 v2 error');
  }

  throw new Error('MSG91: MSG91_OTP_FLOW_ID ya MSG91_DLT_TEMPLATE_ID .env mein set karein');
}

async function sendViaTwilio(mobile, otp) {
  const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = config;
  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) throw new Error('.env: TWILIO_* set karein');
  const to = mobile.length === 10 ? `+91${mobile}` : mobile.startsWith('+') ? mobile : `+91${mobile}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
  const { data } = await axios.post(url, new URLSearchParams({ To: to, From: twilioPhoneNumber, Body: `Your OTP is ${otp}.` }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
  });
  if (data.sid) return true;
  throw new Error(data.message || 'Twilio error');
}

async function sendViaFast2SMS(mobile, otp) {
  if (!config.fast2smsApiKey) throw new Error('.env: FAST2SMS_API_KEY set karein');
  const { data } = await axios.post('https://www.fast2sms.com/dev/bulkV2', { route: 'q', message: `Your OTP is ${otp}.`, numbers: mobile }, {
    headers: { authorization: config.fast2smsApiKey, 'Content-Type': 'application/json' },
  });
  if (data && data.return === true) return true;
  throw new Error(data?.message || 'Fast2SMS error');
}

async function sendViaTextLocal(mobile, otp) {
  if (!config.textlocalApiKey) throw new Error('.env: TEXTLOCAL_API_KEY set karein');
  const { data } = await axios.post('https://api.textlocal.in/send/', {
    apikey: config.textlocalApiKey,
    numbers: `91${mobile}`,
    message: `Your OTP is ${otp}.`,
    sender: config.textlocalSender,
  });
  if (data && data.status === 'success') return true;
  throw new Error(data?.errors?.[0]?.message || 'TextLocal error');
}

async function sendOTP(mobile, otp) {
  const providers = [
    { name: 'msg91', run: () => sendViaMSG91(mobile, otp), ok: config.msg91AuthKey },
    { name: 'twilio', run: () => sendViaTwilio(mobile, otp), ok: config.twilioAccountSid && config.twilioAuthToken && config.twilioPhoneNumber },
    { name: 'fast2sms', run: () => sendViaFast2SMS(mobile, otp), ok: config.fast2smsApiKey },
    { name: 'textlocal', run: () => sendViaTextLocal(mobile, otp), ok: config.textlocalApiKey },
  ];
  const order = [config.smsProvider, ...providers.map((p) => p.name).filter((n) => n !== config.smsProvider)];
  for (const name of order) {
    const p = providers.find((x) => x.name === name);
    if (!p || !p.ok) continue;
    try {
      await p.run();
      return true;
    } catch (err) {
      console.error(`[SMS] ${name} failed:`, err.message);
    }
  }
  return false;
}

module.exports = { sendOTP };
