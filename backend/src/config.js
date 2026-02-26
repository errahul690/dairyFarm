/**
 * Sab configuration .env se – ek hi jagah
 * Koi bhi value direct process.env use na kare, yahan se lo
 */
const get = (key) => {
  const v = process.env[key];
  return v != null && String(v).trim() !== '' ? String(v).trim() : undefined;
};

module.exports = {
  // App
  port: get('PORT') || 4000,
  nodeEnv: get('NODE_ENV'),
  useEthereal: get('USE_ETHEREAL') === 'true',

  // JWT
  jwtSecret: get('JWT_SECRET'),
  jwtExpiresIn: get('JWT_EXPIRES_IN') || '7d',

  // DB
  mongoUri: get('MONGO_URI'),

  // Auth – master OTP (backend only)
  masterOtp: get('MASTER_OTP') || '0903',

  // MSG91 – ek set (MYPIE / MIPIE / MSG91 koi bhi .env mein ho)
  msg91AuthKey: get('AUTH_KEY') || get('MYPIE_MSG91_AUTH_KEY') || get('MIPIE_MSG91_AUTH_KEY') || get('MSG91_AUTH_KEY'),
  msg91SenderId: get('MYPIE_MSG91_SENDER_ID') || get('MIPIE_MSG91_SENDER_ID') || get('MSG91_SENDER_ID'),
  msg91TemplateId: get('TEMPLATE_ID') || get('MSG91_OTP_TEMPLATE_ID') || get('MYPIE_MSG91_OTP_TEMPLATE_ID') || get('MIPIE_MSG91_OTP_TEMPLATE_ID'),
  msg91OtpUrl: get('MYPIE_MSG91_URL') || get('MIPIE_MSG91_URL') || get('MSG91_OTP_URL'),
  msg91SmsUrl: (get('MIPIE_MSG91_SMS_URL') || get('MYPIE_MSG91_SMS_URL') || get('MSG91_SMS_URL') || 'https://api.msg91.com/api/v5/flow/').trim(),
  msg91OtpFlowId: get('MSG91_OTP_FLOW_ID') || get('MYPIE_MSG91_OTP_FLOW_ID') || get('MIPIE_MSG91_OTP_FLOW_ID'),
  msg91FlowId: get('MSG91_FLOW_ID') || get('MYPIE_MSG91_FLOW_ID') || get('MIPIE_MSG91_FLOW_ID'),
  msg91DltTemplateId: get('MSG91_DLT_TEMPLATE_ID'),
  msg91TemplateVariable: get('MSG91_TEMPLATE_VARIABLE') || get('MYPIE_MSG91_OTP_VAR') || 'var1',
  msg91OtpExpiryMinutes: Number(get('MSG91_OTP_EXPIRY_MINUTES')) || 10,

  // SMS provider
  smsProvider: (get('SMS_PROVIDER') || 'msg91').toLowerCase(),

  // Other SMS (Twilio, Fast2SMS, TextLocal)
  twilioAccountSid: get('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: get('TWILIO_AUTH_TOKEN'),
  twilioPhoneNumber: get('TWILIO_PHONE_NUMBER'),
  fast2smsApiKey: get('FAST2SMS_API_KEY'),
  textlocalApiKey: get('TEXTLOCAL_API_KEY'),
  textlocalSender: get('TEXTLOCAL_SENDER') || 'TXTLCL',

  // Email (SMTP)
  smtpHost: get('SMTP_HOST'),
  smtpPort: Number(get('SMTP_PORT')) || 587,
  smtpUser: get('SMTP_USER'),
  smtpPass: get('SMTP_PASS'),
  smtpFrom: get('SMTP_FROM') || get('SMTP_USER'),

  // Flow templates (optional)
  msg91WelcomeTemplate: get('MIPIE_MSG91_WELCOME_TEMPLATE') || get('MYPIE_MSG91_WELCOME_TEMPLATE'),
  msg91ShortlistedTemplate: get('MIPIE_MSG91_SHORTLISTED') || get('MYPIE_MSG91_SHORTLISTED'),
  msg91Rejected: get('MIPIE_MSG91_REJECTED') || get('MYPIE_MSG91_REJECTED'),
  msg91Hired: get('MIPIE_MSG91_HIRED') || get('MYPIE_MSG91_HIRED'),
  msg91InterviewScheduled: get('MIPIE_MSG91_INTERVIEW_SCHEDULED') || get('MYPIE_MSG91_INTERVIEW_SCHEDULED'),
  msg91OnHoldTemplate: get('MIPIE_MSG91_ON_HOLD') || get('MYPIE_MSG91_ON_HOLD'),
  msg91ProfileStrengthening: get('MIPIE_MSG91_PROFILE_STRENGTHENING') || get('MYPIE_MSG91_PROFILE_STRENGTHENING'),
};
