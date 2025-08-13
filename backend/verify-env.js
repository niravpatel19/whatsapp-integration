// Simple script to verify environment variables are loading correctly
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('🔍 Environment Variables Check:');
console.log('================================');

// Check critical environment variables
const criticalVars = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'API_KEY_SALT',
  'WEBHOOK_SIGNING_SECRET'
];

let allGood = true;

criticalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    const maskedValue = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'API_KEY_SALT', 'WEBHOOK_SIGNING_SECRET'].includes(varName)
      ? `${value.substring(0, 8)}...${value.substring(value.length - 8)}`
      : value;
    console.log(`✅ ${varName}: ${maskedValue}`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
    allGood = false;
  }
});

console.log('================================');
if (allGood) {
  console.log('🎉 All critical environment variables are set!');
  console.log('✅ Ready to start the application');
} else {
  console.log('⚠️  Some environment variables are missing');
  console.log('❌ Please check your .env file');
}

console.log('\n📁 Looking for .env file at:', path.resolve(__dirname, '.env'));
console.log('🚀 To start the application, run: npm run dev');