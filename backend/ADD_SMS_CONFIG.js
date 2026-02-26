/**
 * Script to add SMS configuration to .env file
 * Run: node ADD_SMS_CONFIG.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

// SMS configuration to add
const smsConfig = `
# SMS Configuration - MSG91
SMS_PROVIDER=msg91
MSG91_AUTH_KEY=478829AeyVMr6Oxfie691efcb8P1
MSG91_SENDER_ID=msgind
MSG91_DLT_TEMPLATE_ID=691f0c9c002fa55f8e593526
`;

console.log('\n📝 Adding SMS Configuration to .env file...\n');

try {
  // Check if .env file exists
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  .env file not found. Creating new file...');
    
    // Create basic .env file with SMS config
    const basicEnv = `# JWT Configuration
JWT_SECRET=process.env.JWT_SECRET
JWT_EXPIRES_IN=7d

# Database Configuration
MONGO_URI=process.env.MONGO_URI

# Server Configuration
PORT=4000
${smsConfig}`;
    
    fs.writeFileSync(envPath, basicEnv, 'utf8');
    console.log('✅ Created .env file with SMS configuration!\n');
  } else {
    // Read existing .env file
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check if SMS config already exists
    if (envContent.includes('MSG91_AUTH_KEY')) {
      console.log('⚠️  SMS configuration already exists in .env file');
      console.log('   Skipping...\n');
    } else {
      // Append SMS config to existing file
      envContent += smsConfig;
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('✅ SMS configuration added to .env file!\n');
    }
  }
  
  console.log('📋 Added Configuration:');
  console.log('   SMS_PROVIDER=msg91');
  console.log('   MSG91_AUTH_KEY=478829T2BLp732mSj691ef8f5P1');
  console.log('   MSG91_SENDER_ID=RDFOTP\n');
  
  console.log('🚀 Next Steps:');
  console.log('   1. Restart backend server: npm start');
  console.log('   2. Verify: node CHECK_SMS_SETUP.js');
  console.log('   3. Test: Forgot Password → Enter mobile → OTP will come via SMS!\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n📝 Manual Setup:');
  console.log('   Open rdf/backend/.env file and add these lines:');
  console.log('   SMS_PROVIDER=msg91');
  console.log('   MSG91_AUTH_KEY=478829T2BLp732mSj691ef8f5P1');
  console.log('   MSG91_SENDER_ID=RDFOTP\n');
}

