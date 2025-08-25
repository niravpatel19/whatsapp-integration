#!/usr/bin/env ts-node
/**
 * Quick start script - starts API without session restoration
 * Usage: npm run quick-start
 */
import fs from 'fs';
import path from 'path';

function enableQuickStart(): void {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Enable quick start mode
  const updates = [
    { key: 'WPP_SKIP_RESTORE', value: 'true' },
    { key: 'LOG_LEVEL', value: 'info' }, // Reduce log verbosity
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
  
  console.log('🚀 Quick start mode enabled!');
  console.log('   - Session restoration disabled');
  console.log('   - Reduced logging');
  console.log('   - Faster API startup');
  console.log('');
  console.log('💡 Sessions will be created on-demand when requested');
  console.log('');
  console.log('To restore normal mode: npm run normal-start');
}

function enableNormalStart(): void {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Enable normal mode
  const updates = [
    { key: 'WPP_SKIP_RESTORE', value: 'false' },
    { key: 'LOG_LEVEL', value: 'debug' },
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
  
  console.log('🔄 Normal start mode enabled!');
  console.log('   - Session restoration enabled');
  console.log('   - Full logging');
  console.log('   - Complete session management');
}

// Get mode from command line arguments
const mode = process.argv[2];

if (mode === 'quick') {
  enableQuickStart();
} else if (mode === 'normal') {
  enableNormalStart();
} else {
  console.error('Usage: npm run quick-start or npm run normal-start');
  process.exit(1);
}