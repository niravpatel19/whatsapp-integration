#!/usr/bin/env ts-node
/**
 * Session optimization script
 * Usage: npm run optimize-sessions
 */
import fs from 'fs';
import path from 'path';

function optimizeForMultipleSessions(): void {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Optimize for multiple sessions
  const updates = [
    { key: 'WPP_SKIP_RESTORE', value: 'false' },
    { key: 'WPP_RESTORE_DELAY', value: '1000' }, // Faster restoration
    { key: 'WPP_MAX_CONCURRENT_RESTORE', value: '5' }, // More concurrent restorations
    { key: 'WPP_MAX_CONCURRENT_INIT', value: '3' }, // More concurrent initializations
    { key: 'WPP_BROWSER_TIMEOUT', value: '20000' }, // Faster timeout
    { key: 'LOG_LEVEL', value: 'info' }, // Reduce logging overhead
  ];

  updates.forEach(({ key, value }) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newValue = `${key}=${value}`;
    
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, newValue);
    } else {
      envContent += `\n${newValue}`;
    }
  });

  fs.writeFileSync(envPath, envContent);
  
  console.log('🚀 Multiple session optimization enabled!');
  console.log('   - Faster session restoration');
  console.log('   - Higher concurrency limits');
  console.log('   - Reduced timeouts');
  console.log('   - Optimized logging');
  console.log('');
  console.log('💡 Configuration:');
  updates.forEach(({ key, value }) => {
    console.log(`   ${key}=${value}`);
  });
  console.log('');
  console.log('⚠️  Restart your application: npm run build && npm start');
}

function optimizeForSingleSession(): void {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Optimize for single session (fastest startup)
  const updates = [
    { key: 'WPP_SKIP_RESTORE', value: 'true' },
    { key: 'WPP_MAX_CONCURRENT_INIT', value: '1' },
    { key: 'WPP_BROWSER_TIMEOUT', value: '15000' },
    { key: 'LOG_LEVEL', value: 'warn' }, // Minimal logging
  ];

  updates.forEach(({ key, value }) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newValue = `${key}=${value}`;
    
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, newValue);
    } else {
      envContent += `\n${newValue}`;
    }
  });

  fs.writeFileSync(envPath, envContent);
  
  console.log('⚡ Single session optimization enabled!');
  console.log('   - Session restoration disabled');
  console.log('   - Single concurrent initialization');
  console.log('   - Fastest timeouts');
  console.log('   - Minimal logging');
  console.log('');
  console.log('💡 Configuration:');
  updates.forEach(({ key, value }) => {
    console.log(`   ${key}=${value}`);
  });
  console.log('');
  console.log('⚠️  Restart your application: npm run build && npm start');
}

// Get mode from command line arguments
const mode = process.argv[2];

if (mode === 'multiple') {
  optimizeForMultipleSessions();
} else if (mode === 'single') {
  optimizeForSingleSession();
} else {
  console.error('Usage: npm run optimize-sessions multiple|single');
  console.log('');
  console.log('Options:');
  console.log('  multiple - Optimize for multiple concurrent sessions');
  console.log('  single   - Optimize for single session (fastest startup)');
  process.exit(1);
}