#!/usr/bin/env ts-node

/**
 * Script to toggle between real and stub WhatsApp integration
 * Usage: npm run whatsapp:real or npm run whatsapp:stub
 */

import fs from 'fs';
import path from 'path';

function toggleWhatsApp(mode: 'real' | 'stub'): void {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  
  const useReal = mode === 'real';
  const newValue = `WPP_USE_REAL_WHATSAPP=${useReal}`;
  
  // Replace existing value or add new one
  const regex = /^WPP_USE_REAL_WHATSAPP=.*$/m;
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, newValue);
  } else {
    envContent += `\n${newValue}`;
  }
  
  fs.writeFileSync(envPath, envContent);
  
  console.log(`✅ WhatsApp integration set to: ${mode.toUpperCase()}`);
  console.log(`   WPP_USE_REAL_WHATSAPP=${useReal}`);
  console.log('');
  console.log('⚠️  Please restart your application for changes to take effect:');
  console.log('   npm run build && npm start');
}

// Get mode from command line arguments
const mode = process.argv[2] as 'real' | 'stub';

if (!mode || !['real', 'stub'].includes(mode)) {
  console.error('Usage: npm run whatsapp:real or npm run whatsapp:stub');
  process.exit(1);
}

toggleWhatsApp(mode);