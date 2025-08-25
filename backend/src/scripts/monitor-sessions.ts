#!/usr/bin/env ts-node

/**
 * Script to monitor and diagnose session issues
 * Usage: npm run monitor-sessions
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Session } from '../models/Session.model';
import { WPPConnectManager } from '../wpp/manager.factory';
import { SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';

async function monitorSessions(): Promise<void> {
  try {
    logger.info('Starting session monitoring...');

    // Connect to database
    await connectDatabase();

    // Get all sessions
    const sessions = await Session.find({}).sort({ updatedAt: -1 });

    console.log('\n=== SESSION MONITORING REPORT ===\n');
    console.log(`Total Sessions: ${sessions.length}`);

    // Group sessions by status
    const statusGroups = sessions.reduce((acc, session) => {
      const status = session.status;
      if (!acc[status]) acc[status] = [];
      acc[status].push(session);
      return acc;
    }, {} as Record<string, any[]>);

    // Display status summary
    console.log('\nStatus Summary:');
    Object.entries(statusGroups).forEach(([status, sessionList]) => {
      console.log(`  ${status}: ${sessionList.length}`);
    });

    // Show detailed information for each session
    console.log('\n=== DETAILED SESSION INFORMATION ===\n');

    for (const session of sessions) {
      const timeSinceUpdate = Date.now() - session.updatedAt.getTime();
      const timeSinceUpdateHours = Math.round(timeSinceUpdate / (1000 * 60 * 60));
      const timeSinceUpdateMinutes = Math.round(timeSinceUpdate / (1000 * 60));

      console.log(`Session ID: ${session.sessionId}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Device: ${session.deviceInfo?.name || 'Unknown'}`);
      console.log(`  Phone: ${session.phone || 'Not connected'}`);
      console.log(`  Created: ${session.createdAt.toISOString()}`);
      console.log(`  Updated: ${session.updatedAt.toISOString()} (${timeSinceUpdateMinutes} minutes ago)`);
      console.log(`  Last Seen: ${session.lastSeenAt?.toISOString() || 'Never'}`);
      console.log(`  Message Count: ${session.messageCount}`);
      console.log(`  Error Count: ${session.errorCount}`);
      
      if (session.lastErrorMessage) {
        console.log(`  Last Error: ${session.lastErrorMessage}`);
      }

      // Check if session might be falsely expired
      if (session.status === SessionStatus.EXPIRED) {
        console.log(`  ⚠️  EXPIRED SESSION DETECTED`);
        
        if (timeSinceUpdateHours < 24) {
          console.log(`  🔍 Recently updated (${timeSinceUpdateHours}h ago) - might be recoverable`);
        }
        
        if (session.lastSeenAt && (Date.now() - session.lastSeenAt.getTime()) < 2 * 60 * 60 * 1000) {
          console.log(`  🔍 Recently active (last seen ${Math.round((Date.now() - session.lastSeenAt.getTime()) / (1000 * 60))} minutes ago) - likely recoverable`);
        }
      }

      // Check WPPConnect manager status
      try {
        const wppManager = WPPConnectManager.getInstance();
        const sessionStatus = wppManager.getSessionStatus(session.sessionId);
        const isReady = wppManager.isSessionReady(session.sessionId);
        
        if (sessionStatus || isReady) {
          console.log(`  🔗 WPPConnect Status: ${sessionStatus || 'Unknown'} (Ready: ${isReady})`);
          
          if (session.status === SessionStatus.EXPIRED && isReady) {
            console.log(`  ⚠️  MISMATCH: Database shows EXPIRED but WPPConnect shows ready!`);
          }
        }
      } catch (wppError) {
        // WPPConnect manager might not be initialized
      }

      console.log('');
    }

    // Show recommendations
    console.log('\n=== RECOMMENDATIONS ===\n');

    const expiredSessions = statusGroups[SessionStatus.EXPIRED] || [];
    const recentlyExpired = expiredSessions.filter(session => {
      const timeSinceUpdate = Date.now() - session.updatedAt.getTime();
      return timeSinceUpdate < 24 * 60 * 60 * 1000; // Less than 24 hours
    });

    if (recentlyExpired.length > 0) {
      console.log(`🔧 ${recentlyExpired.length} recently expired sessions might be recoverable:`);
      recentlyExpired.forEach(session => {
        console.log(`   - ${session.sessionId} (${session.deviceInfo?.name || 'Unknown'})`);
        console.log(`     Recovery command: npm run recover-session ${session.sessionId}`);
      });
      console.log('');
    }

    const connectedSessions = statusGroups[SessionStatus.CONNECTED] || [];
    console.log(`✅ ${connectedSessions.length} sessions are currently connected and healthy`);

    const qrSessions = statusGroups[SessionStatus.QR] || [];
    if (qrSessions.length > 0) {
      console.log(`📱 ${qrSessions.length} sessions are waiting for QR scan`);
    }

    const disconnectedSessions = statusGroups[SessionStatus.DISCONNECTED] || [];
    if (disconnectedSessions.length > 0) {
      console.log(`🔌 ${disconnectedSessions.length} sessions are disconnected and can be reconnected`);
    }

  } catch (error) {
    logger.error('Session monitoring failed:', error);
  } finally {
    await disconnectDatabase();
  }
}

// Run the monitoring
monitorSessions()
  .then(() => {
    console.log('\nSession monitoring completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Session monitoring failed:', error);
    process.exit(1);
  });