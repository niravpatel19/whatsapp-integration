#!/usr/bin/env ts-node

/**
 * Script to fix missing phone numbers and last seen timestamps for connected sessions
 * Usage: npm run fix-session-info [sessionId]
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Session } from '../models/Session.model';
import { WPPConnectManager } from '../wpp/manager.factory';
import { SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';

async function fixSessionInfo(specificSessionId?: string): Promise<void> {
  try {
    logger.info('Starting session info fix...');

    // Connect to database
    await connectDatabase();

    // Find connected sessions that need fixing
    const query: any = { status: SessionStatus.CONNECTED };
    if (specificSessionId) {
      query.sessionId = specificSessionId;
    } else {
      // Find sessions missing phone or lastSeenAt
      query.$or = [
        { phone: { $exists: false } },
        { phone: null },
        { phone: '' },
        { lastSeenAt: { $exists: false } },
        { lastSeenAt: null },
      ];
    }

    const sessionsToFix = await Session.find(query);

    console.log(`\n=== SESSION INFO FIX ===\n`);
    console.log(`Found ${sessionsToFix.length} sessions to fix`);

    if (sessionsToFix.length === 0) {
      console.log('No sessions need fixing.');
      return;
    }

    // Initialize WPPConnect manager
    const wppManager = WPPConnectManager.getInstance();
    await wppManager.initialize();

    for (const session of sessionsToFix) {
      try {
        console.log(`\nFixing session: ${session.sessionId}`);
        console.log(`  Current phone: ${session.phone || 'Not set'}`);
        console.log(`  Current lastSeenAt: ${session.lastSeenAt?.toISOString() || 'Not set'}`);

        // Check if session is active in WPPConnect manager
        const clientInfo = wppManager.getClientInfo(session.sessionId);

        if (!clientInfo || !clientInfo.client) {
          console.log(`  ⚠️  Session not active in WPPConnect manager`);

          // Update lastSeenAt to current time for database consistency
          await Session.findOneAndUpdate(
            { sessionId: session.sessionId },
            {
              $set: {
                lastSeenAt: new Date(),
                // If phone is missing, mark as unknown for now
                ...((!session.phone || session.phone === '') && { phone: 'Unknown' }),
              },
            }
          );
          console.log(`  ✅ Updated lastSeenAt to current time`);
          continue;
        }

        console.log(`  🔍 Session is active, attempting to retrieve device info...`);

        // Try to get device information
        let phoneNumber = null;
        let deviceName = session.deviceInfo?.name || 'Unknown';
        let success = false;

        // Method 1: getHostDevice
        try {
          const hostDevice = await clientInfo.client.getHostDevice();
          if (hostDevice && hostDevice.wid) {
            phoneNumber = hostDevice.wid._serialized.split('@')[0];
            deviceName = hostDevice.pushname || deviceName;
            console.log(`  ✅ Retrieved via getHostDevice: ${phoneNumber}`);
            success = true;
          }
        } catch (error) {
          console.log(`  ❌ getHostDevice failed:`, error.message);
        }

        // Method 2: getWid (if first method failed)
        if (!success) {
          try {
            const wid = await clientInfo.client.getWid();
            if (wid && wid._serialized) {
              phoneNumber = wid._serialized.split('@')[0];
              console.log(`  ✅ Retrieved via getWid: ${phoneNumber}`);
              success = true;
            }
          } catch (error) {
            console.log(`  ❌ getWid failed:`, error.message);
          }
        }

        // Method 3: Try session token (if previous methods failed)
        if (!success) {
          try {
            const sessionInfo = await clientInfo.client.getSessionTokenBrowser();
            if (sessionInfo && sessionInfo.me) {
              phoneNumber = sessionInfo.me.split('@')[0];
              console.log(`  ✅ Retrieved via session token: ${phoneNumber}`);
              success = true;
            }
          } catch (error) {
            console.log(`  ❌ Session token method failed:`, error.message);
          }
        }

        // Update database with retrieved information
        const updateData: any = {
          lastSeenAt: new Date(),
        };

        if (phoneNumber) {
          // Format phone number properly
          const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
          updateData.phone = formattedPhone;

          // Update in-memory client info too
          clientInfo.phone = formattedPhone;
        }

        if (deviceName && deviceName !== 'Unknown') {
          updateData.deviceInfo = {
            name: deviceName,
            platform: 'WhatsApp Web',
            version: 'Unknown',
            browser: 'Chrome',
            os: 'Linux',
          };

          // Update in-memory client info too
          clientInfo.deviceInfo = updateData.deviceInfo;
        }

        await Session.findOneAndUpdate({ sessionId: session.sessionId }, { $set: updateData });

        console.log(`  ✅ Updated session in database:`);
        console.log(`     Phone: ${updateData.phone || 'Still unknown'}`);
        console.log(`     Device: ${updateData.deviceInfo?.name || 'Still unknown'}`);
        console.log(`     Last Seen: ${updateData.lastSeenAt.toISOString()}`);
      } catch (error) {
        console.log(`  ❌ Failed to fix session ${session.sessionId}:`, error.message);
      }
    }

    console.log(`\n=== FIX COMPLETED ===\n`);
    console.log('Session info fix completed. Check your dashboard to see updated information.');
  } catch (error) {
    logger.error('Session info fix failed:', error);
  } finally {
    await disconnectDatabase();
  }
}

// Get session ID from command line arguments
const sessionId = process.argv[2];

// Run the fix
fixSessionInfo(sessionId)
  .then(() => {
    console.log('\nSession info fix completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Session info fix failed:', error);
    process.exit(1);
  });
