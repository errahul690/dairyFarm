/**
 * Quick script to check SMS configuration
 * Run: node CHECK_SMS_SETUP.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

console.log('\n📱 SMS Configuration Check\n');
console.log('='.repeat(50));

const provider = process.env.SMS_PROVIDER || 'msg91';
console.log(`✅ SMS Provider: ${provider}`);

// Check MSG91
const msg91Key = process.env.MSG91_AUTH_KEY;
if (msg91Key && msg91Key !== 'your_auth_key_here') {
  console.log('✅ MSG91_AUTH_KEY: Configured');
  console.log(`   Key: ${msg91Key.substring(0, 10)}...`);
} else {
  console.log('❌ MSG91_AUTH_KEY: Not configured');
  console.log('   Expected: 478829T2BLp732mSj691ef8f5P1');
}

// Check MSG91 Widget (Optional)
const widgetId = process.env.MSG91_WIDGET_ID;
const tokenAuth = process.env.MSG91_TOKEN_AUTH;
if (widgetId && tokenAuth) {
  console.log('✅ MSG91_WIDGET: Configured (Optional)');
} else {
  console.log('ℹ️  MSG91_WIDGET: Not configured (Optional)');
}

// Check Fast2SMS
const fast2smsKey = process.env.FAST2SMS_API_KEY;
if (fast2smsKey && fast2smsKey !== 'your_api_key_here') {
  console.log('✅ FAST2SMS_API_KEY: Configured');
} else {
  console.log('❌ FAST2SMS_API_KEY: Not configured');
}

// Check TextLocal
const textlocalKey = process.env.TEXTLOCAL_API_KEY;
if (textlocalKey && textlocalKey !== 'your_api_key_here') {
  console.log('✅ TEXTLOCAL_API_KEY: Configured');
} else {
  console.log('❌ TEXTLOCAL_API_KEY: Not configured');
}

console.log('\n' + '='.repeat(50));

// Final status
const hasAnyKey = (msg91Key && msg91Key !== 'your_auth_key_here') ||
                  (fast2smsKey && fast2smsKey !== 'your_api_key_here') ||
                  (textlocalKey && textlocalKey !== 'your_api_key_here');

if (hasAnyKey) {
  console.log('\n✅ SMS is CONFIGURED - OTP will be sent via SMS!');
  console.log('📱 Test by using Forgot Password feature\n');
} else {
  console.log('\n⚠️  SMS is NOT CONFIGURED - OTP will only log in console');
  console.log('📝 Setup Instructions:');
  console.log('   1. Sign up at: https://msg91.com/ (Free: 100 SMS)');
  console.log('   2. Get Auth Key from dashboard');
  console.log('   3. Add to .env file:');
  console.log('      SMS_PROVIDER=msg91');
  console.log('      MSG91_AUTH_KEY=your_key_here');
  console.log('   4. Restart backend server\n');
}

