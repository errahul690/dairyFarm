/**
 * Check stored OTPs for debugging
 * Run: node CHECK_OTP.js [mobile_number]
 * Example: node CHECK_OTP.js 6280484227
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { getAllStoredOTPs, getStoredOTP } = require('./src/utils/otpStore');

const mobile = process.argv[2];

console.log('\n🔐 OTP Store Check\n');
console.log('='.repeat(50));

if (mobile) {
  // Check specific mobile
  const otp = getStoredOTP(mobile);
  if (otp) {
    console.log(`✅ OTP found for mobile: ${mobile}`);
    console.log(`🔢 OTP: ${otp}`);
  } else {
    console.log(`❌ No active OTP found for mobile: ${mobile}`);
    console.log(`   (OTP might be expired or not generated)`);
  }
} else {
  // Show all stored OTPs
  const allOTPs = getAllStoredOTPs();
  
  if (allOTPs.length === 0) {
    console.log('❌ No active OTPs found in store');
    console.log('   (Either no OTPs generated or all expired)');
  } else {
    console.log(`✅ Found ${allOTPs.length} active OTP(s):\n`);
    allOTPs.forEach((item, index) => {
      console.log(`${index + 1}. Mobile: +91${item.mobile}`);
      console.log(`   OTP: ${item.otp}`);
      console.log(`   Expires: ${item.expiresAt}`);
      console.log(`   User ID: ${item.userId}`);
      console.log('');
    });
  }
  
  console.log('\n💡 Usage:');
  console.log('   node CHECK_OTP.js              - Show all OTPs');
  console.log('   node CHECK_OTP.js 6280484227   - Check specific mobile\n');
}

console.log('='.repeat(50));
console.log('');

