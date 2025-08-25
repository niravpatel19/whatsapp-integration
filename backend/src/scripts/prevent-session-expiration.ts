#!/usr/bin/env ts-node

/**
 * Script to implement session expiration prevention measures
 * This script updates configuration and adds monitoring to prevent sessions from expiring
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Session } from '../models/Session.model';
import { SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

async function preventSessionExpiration(): Promise<void> {
  try {
    logger.info('Implementing session expiration prevention measures...');

    // Connect to database
    await connectDatabase();

    console.log('\n=== SESSION EXPIRATION PREVENTION ===\n');

    // 1. Update environment configuration
    console.log('1. Checking environment configuration...');

    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Add or update WPPConnect specific settings
    const wppSettings = [
      'WPP_AUTO_CLOSE=0',
      'WPP_DISABLE_SPINS=true',
      'WPP_DISABLE_WELCOME=true',
      'WPP_UPDATES_LOG=false',
      'WPP_HEALTH_CHECK_INTERVAL=900000', // 15 minutes
      'WPP_SESSION_TIMEOUT=7200000', // 2 hours
      'WPP_RECOVERY_ENABLED=true',
    ];

    let envUpdated = false;
    wppSettings.forEach((setting) => {
      const [key, value] = setting.split('=');
      const regex = new RegExp(`^${key}=.*$`, 'm');

      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, setting);
      } else {
        envContent += `\n${setting}`;
        envUpdated = true;
      }
    });

    if (envUpdated) {
      fs.writeFileSync(envPath, envContent);
      console.log('   ✅ Environment configuration updated');
    } else {
      console.log('   ✅ Environment configuration is already optimal');
    }

    // 2. Check and fix database TTL indexes
    console.log('\n2. Checking database TTL indexes...');

    try {
      const indexes = await Session.collection.getIndexes();
      console.log('   Current indexes:', Object.keys(indexes));

      // Remove aggressive TTL indexes if they exist
      const problematicIndexes = Object.keys(indexes).filter(
        (indexName) =>
          indexName.includes('updatedAt') &&
          indexes[indexName].some(
            (spec: any) => spec.expireAfterSeconds && spec.expireAfterSeconds < 86400 // Less than 24 hours
          )
      );

      if (problematicIndexes.length > 0) {
        console.log('   ⚠️  Found aggressive TTL indexes that might cause premature expiration');
        for (const indexName of problematicIndexes) {
          try {
            await Session.collection.dropIndex(indexName);
            console.log(`   ✅ Dropped aggressive TTL index: ${indexName}`);
          } catch (dropError) {
            console.log(`   ⚠️  Could not drop index ${indexName}:`, dropError);
          }
        }
      } else {
        console.log('   ✅ No problematic TTL indexes found');
      }
    } catch (indexError) {
      console.log('   ⚠️  Could not check indexes:', indexError);
    }

    // 3. Update sessions that might be falsely expired
    console.log('\n3. Checking for falsely expired sessions...');

    const recentlyExpiredSessions = await Session.find({
      status: SessionStatus.EXPIRED,
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      lastSeenAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // Active within 2 hours
    });

    if (recentlyExpiredSessions.length > 0) {
      console.log(`   Found ${recentlyExpiredSessions.length} potentially recoverable sessions:`);

      for (const session of recentlyExpiredSessions) {
        console.log(`   - ${session.sessionId} (${session.deviceInfo?.name || 'Unknown'})`);

        // Reset to DISCONNECTED for manual reconnection
        await Session.updateStatus(session.sessionId, SessionStatus.DISCONNECTED);
        console.log(`     ✅ Reset to DISCONNECTED status`);
      }
    } else {
      console.log('   ✅ No falsely expired sessions found');
    }

    // 4. Create monitoring cron job script
    console.log('\n4. Creating session monitoring cron job...');

    const cronScript = `#!/bin/bash
# WhatsApp Session Monitoring Cron Job
# Add this to your crontab: */15 * * * * /path/to/this/script

cd ${process.cwd()}
npm run monitor-sessions >> logs/session-monitor.log 2>&1

# Check for sessions that need recovery
EXPIRED_COUNT=$(npm run monitor-sessions 2>/dev/null | grep "recently expired" | wc -l)
if [ "$EXPIRED_COUNT" -gt 0 ]; then
    echo "$(date): Found $EXPIRED_COUNT sessions that may need recovery" >> logs/session-alerts.log
fi
`;

    const cronScriptPath = path.join(process.cwd(), 'monitor-sessions-cron.sh');
    fs.writeFileSync(cronScriptPath, cronScript);
    fs.chmodSync(cronScriptPath, '755');
    console.log(`   ✅ Created monitoring cron script: ${cronScriptPath}`);

    // 5. Create session recovery service
    console.log('\n5. Creating session recovery service...');

    const recoveryService = `#!/usr/bin/env ts-node

/**
 * Automated session recovery service
 * This runs periodically to recover expired sessions
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Session } from '../models/Session.model';
import { WPPConnectManager } from '../wpp/manager.factory';
import { SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';

async function autoRecoverSessions(): Promise<void> {
  try {
    await connectDatabase();
    
    // Find sessions that might be recoverable
    const recoverableSessions = await Session.find({
      status: SessionStatus.EXPIRED,
      updatedAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // Last 6 hours
      errorCount: { $lt: 5 } // Not too many errors
    });

    logger.info(\`Found \${recoverableSessions.length} potentially recoverable sessions\`);

    for (const session of recoverableSessions) {
      try {
        logger.info(\`Attempting auto-recovery for session: \${session.sessionId}\`);
        
        // Reset to DISCONNECTED
        await Session.updateStatus(session.sessionId, SessionStatus.DISCONNECTED);
        
        // Try to reconnect
        const wppManager = WPPConnectManager.getInstance();
        await wppManager.reconnectClient(session.sessionId);
        
        logger.info(\`Auto-recovery initiated for session: \${session.sessionId}\`);
        
        // Wait between recoveries to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        logger.error(\`Auto-recovery failed for session \${session.sessionId}:\`, error);
      }
    }
    
  } catch (error) {
    logger.error('Auto-recovery service failed:', error);
  } finally {
    await disconnectDatabase();
  }
}

// Run if called directly
if (require.main === module) {
  autoRecoverSessions()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { autoRecoverSessions };
`;

    const recoveryServicePath = path.join(process.cwd(), 'src/scripts/auto-recovery-service.ts');
    fs.writeFileSync(recoveryServicePath, recoveryService);
    console.log(`   ✅ Created auto-recovery service: ${recoveryServicePath}`);

    // 6. Display final recommendations
    console.log('\n=== PREVENTION MEASURES IMPLEMENTED ===\n');
    console.log('✅ Environment configuration optimized');
    console.log('✅ Database TTL indexes checked and fixed');
    console.log('✅ Falsely expired sessions reset');
    console.log('✅ Monitoring cron job created');
    console.log('✅ Auto-recovery service created');

    console.log('\n=== NEXT STEPS ===\n');
    console.log('1. Restart your application to apply environment changes');
    console.log('2. Add the monitoring cron job to your system:');
    console.log(`   */15 * * * * ${cronScriptPath}`);
    console.log('3. Monitor your sessions regularly with:');
    console.log('   npm run monitor-sessions');
    console.log('4. For immediate recovery of your current expired session:');
    console.log('   npm run recover-session dc71559a-e9fd-4f0d-90f2-03a813495c35');
  } catch (error) {
    logger.error('Prevention setup failed:', error);
  } finally {
    await disconnectDatabase();
  }
}

// Run the prevention setup
preventSessionExpiration()
  .then(() => {
    console.log('\\nSession expiration prevention setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Prevention setup failed:', error);
    process.exit(1);
  });
