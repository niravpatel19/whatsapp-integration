#!/usr/bin/env ts-node

/**
 * Script to recover expired sessions and restore them to proper state
 * Usage: npm run recover-session <sessionId>
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Session } from '../models/Session.model';
import { WPPConnectManager } from '../wpp/manager.factory';
import { SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';

async function recoverExpiredSession(sessionId: string): Promise<void> {
  try {
    logger.info(`Starting recovery for session: ${sessionId}`);

    // Connect to database
    await connectDatabase();

    // Find the session
    const session = await Session.findOne({ sessionId });
    if (!session) {
      logger.error(`Session not found: ${sessionId}`);
      return;
    }

    logger.info(`Found session: ${sessionId}`, {
      status: session.status,
      lastSeenAt: session.lastSeenAt,
      deviceInfo: session.deviceInfo,
    });

    // Check if session is actually expired or just marked as expired
    if (session.status === SessionStatus.EXPIRED) {
      logger.info(`Session is marked as EXPIRED, attempting to restore...`);

      // Reset session status to DISCONNECTED for manual reconnection
      await Session.updateStatus(sessionId, SessionStatus.DISCONNECTED);
      logger.info(`Session status updated to DISCONNECTED`);

      // Initialize WPPConnect manager
      const wppManager = WPPConnectManager.getInstance();
      await wppManager.initialize();

      // Try to reconnect the session
      try {
        await wppManager.reconnectClient(sessionId);
        logger.info(`Session reconnection initiated: ${sessionId}`);
        
        // Wait a bit for the connection to establish
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check the new status
        const updatedSession = await Session.findOne({ sessionId });
        logger.info(`Session recovery completed. New status: ${updatedSession?.status}`);
        
      } catch (reconnectError) {
        logger.error(`Failed to reconnect session: ${sessionId}`, reconnectError);
        
        // If reconnection fails, try to initialize a fresh session
        try {
          await wppManager.initializeClient(sessionId, {
            session: sessionId,
            deviceName: session.deviceInfo?.name || 'WhatsApp Web',
            headless: true,
            devtools: false,
            useChrome: true,
            debug: false,
            logQR: false,
            browserArgs: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu',
            ],
          });
          
          logger.info(`Fresh session initialization completed: ${sessionId}`);
        } catch (initError) {
          logger.error(`Failed to initialize fresh session: ${sessionId}`, initError);
        }
      }
    } else {
      logger.info(`Session is not expired (status: ${session.status}), no recovery needed`);
    }

  } catch (error) {
    logger.error('Session recovery failed:', error);
  } finally {
    await disconnectDatabase();
  }
}

// Get session ID from command line arguments
const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: npm run recover-session <sessionId>');
  process.exit(1);
}

// Run the recovery
recoverExpiredSession(sessionId)
  .then(() => {
    console.log('Session recovery completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Session recovery failed:', error);
    process.exit(1);
  });