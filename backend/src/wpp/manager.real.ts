import { create, Whatsapp } from '@wppconnect-team/wppconnect';
import { logger } from '../utils/logger';
import { Session } from '../models/Session.model';
import { QREvent } from '../models/QREvent.model';
import { Event } from '../models/Event.model';
import { Message } from '../models/Message.model';
import { EventService } from '../services/event.service';
import { WPPNotificationHandler } from './notification.handler';
import { SessionStatus, EventType, MessageStatus, MessageType } from '../types/database.types';
import path from 'path';
import fs from 'fs';

export interface WPPConfig {
  session: string;
  deviceName?: string;
  headless: boolean;
  devtools: boolean;
  useChrome: boolean;
  debug: boolean;
  logQR: boolean;
  browserArgs: string[];
}

export interface ClientInfo {
  sessionId: string;
  client: Whatsapp | null;
  status: 'INITIALIZING' | 'QR' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  createdAt: Date;
  lastActivity: Date;
  errorCount: number;
  messageCount: number;
  connectionTime?: Date;
  deviceInfo?: any;
  phone?: string;
  // QR state management like working demo
  qrData?: string;
  qrAttempts?: number;
  qrExpiresAt?: Date;
  isConnecting?: boolean;
  // Status change debouncing
  lastStatusChange?: Date;
  pendingStatusChange?: string;
}

export interface ClientMetrics {
  totalClients: number;
  connectedClients: number;
  qrClients: number;
  errorClients: number;
  memoryUsage: number;
  averageConnectionTime: number;
  totalMessages: number;
  errorRate: number;
}

/**
 * Real WPPConnect Manager for WhatsApp Integration
 * Fixed to use in-memory session tracking like the working demo
 */
export class WPPConnectManager {
  private static instance: WPPConnectManager;
  private clients: Map<string, ClientInfo> = new Map();
  private isInitialized = false;
  private sessionsPath: string;
  // Prevent concurrent client creations for the same session
  private creatingSessions: Set<string> = new Set();

  private constructor() {
    // Create sessions directory for storing WhatsApp session data
    this.sessionsPath = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
    logger.info('WPPConnectManager initialized');
  }

  static getInstance(): WPPConnectManager {
    if (!WPPConnectManager.instance) {
      WPPConnectManager.instance = new WPPConnectManager();
    }
    return WPPConnectManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('Initializing WPPConnect Manager');

    // Restore existing sessions after restart (using in-memory approach)
    await this.restoreExistingSessions();

    // Start health monitoring
    this.startHealthMonitoring();

    this.isInitialized = true;
    logger.info('WPPConnect Manager initialization completed');
  }

  /**
   * Restore existing sessions after backend restart
   * Fixed to use in-memory session management like working demo
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      logger.info('Restoring existing sessions after restart...');

      // Find all sessions that should be active (exclude very old CONNECTED sessions)
      const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      // Restore sessions that can be automatically restored
      // Only restore CONNECTED and recent DISCONNECTED sessions automatically
      // QR, PENDING, EXPIRED, ERROR sessions should be restored manually by user
      const activeSessions = await Session.find({
        $or: [
          // Recently connected sessions that should be auto-restored
          {
            status: SessionStatus.CONNECTED,
            lastSeenAt: { $gte: cutoffTime }
          },
          // Recently disconnected sessions that might still be valid
          {
            status: SessionStatus.DISCONNECTED,
            lastSeenAt: { $gte: cutoffTime }
          }
        ]
      })
        .select('sessionId userId deviceInfo status phone lastSeenAt createdAt updatedAt')
        .lean();

      // DO NOT clean up any sessions - users should always see their sessions in the list
      // QR, PENDING, EXPIRED, ERROR sessions remain visible for manual reconnection

      logger.info(`Found ${activeSessions.length} sessions for automatic restoration`);

      // Only auto-restore sessions that are likely to work (CONNECTED and recent DISCONNECTED)
      // Other sessions (QR, PENDING, EXPIRED, ERROR) should be restored manually by user
      const restorationPromises = activeSessions.map(async (session) => {
        const sessionId = session.sessionId;
        const sessionStatus = session.status;
        
        try {
          logger.info(`Auto-restoring session: ${sessionId} (status: ${sessionStatus})`);

          // Initialize in-memory client info first
          const clientInfo: ClientInfo = {
            sessionId: session.sessionId,
            client: null,
            status: 'INITIALIZING',
            createdAt: new Date(),
            lastActivity: new Date(),
            errorCount: 0,
            messageCount: 0,
            deviceInfo: session.deviceInfo,
            phone: session.phone,
            isConnecting: true,
          };

          // Add to in-memory map immediately
          this.clients.set(session.sessionId, clientInfo);

          // Restore with timeout protection (30 seconds for auto-restoration)
          const restorationTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Auto-restoration timeout')), 30000);
          });

          const restorationPromise = this.initializeClientInternal(session.sessionId, {
            session: session.sessionId,
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

          await Promise.race([restorationPromise, restorationTimeout]);

          logger.info(`✅ Auto-restoration completed: ${sessionId} (was ${sessionStatus})`);
        } catch (error) {
          logger.warn(`⚠️ Auto-restoration failed for ${sessionId} (was ${sessionStatus}):`, error);
          
          // Clean up failed session from memory
          this.clients.delete(sessionId);
          
          // Mark failed auto-restorations as DISCONNECTED for manual reconnection
          try {
            await Session.updateStatus(sessionId, SessionStatus.DISCONNECTED);
            logger.info(`Marked failed auto-restoration ${sessionId} as DISCONNECTED for manual reconnection`);
          } catch (dbError) {
            logger.error(`Failed to update session status for ${sessionId}:`, dbError);
          }
        }
      });

      // Wait for all auto-restorations to complete with overall timeout
      const overallTimeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.warn('Auto-restoration overall timeout reached, continuing with server startup');
          resolve();
        }, 90000); // 90 seconds overall timeout for auto-restoration
      });

      await Promise.race([
        Promise.allSettled(restorationPromises),
        overallTimeout
      ]);

      logger.info('Session restoration completed');
    } catch (error) {
      logger.error('Failed to restore existing sessions:', error);
    }
  }

  async initializeClient(sessionId: string, config: WPPConfig): Promise<void> {
    logger.info(`Initializing WPP client: ${sessionId}`, config);

    // Prevent concurrent inits
    if (this.creatingSessions.has(sessionId)) {
      logger.warn(`Initialization already in progress for ${sessionId}, skipping.`);
      return;
    }

    const existing = this.clients.get(sessionId);
    if (existing && existing.client && existing.status === 'CONNECTED') {
      logger.info(`Session ${sessionId} already CONNECTED, skipping re-initialization.`);
      return;
    }

    this.creatingSessions.add(sessionId);
    try {
      // Create in-memory client info first (like working demo)
      const clientInfo: ClientInfo = {
        sessionId,
        client: null,
        status: 'INITIALIZING',
        createdAt: new Date(),
        lastActivity: new Date(),
        errorCount: 0,
        messageCount: 0,
        isConnecting: true,
        // Initialize device info from config if provided
        deviceInfo: config.deviceName ? {
          name: config.deviceName,
          platform: 'WhatsApp Web',
          version: 'Unknown',
          browser: 'Chrome',
          os: 'Linux',
        } : undefined,
      };

      this.clients.set(sessionId, clientInfo);

      // Initialize the actual WPP client
      await this.initializeClientInternal(sessionId, config);

      logger.info(`WPP client initialized successfully: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to initialize WPP client ${sessionId}:`, error);
      await Session.updateStatus(sessionId, SessionStatus.ERROR, (error as Error).message);

      const clientInfo = this.clients.get(sessionId);
      if (clientInfo) {
        clientInfo.status = 'ERROR';
        clientInfo.errorCount++;
        clientInfo.isConnecting = false;
      }
    } finally {
      this.creatingSessions.delete(sessionId);
    }
  }

  /**
   * Internal client initialization (using working demo patterns)
   */
  private async initializeClientInternal(sessionId: string, config: WPPConfig): Promise<void> {
    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo) {
      throw new Error('Client info not found in memory');
    }

    // Ensure session directory exists and clear stale SingletonLock to avoid Chrome profile lock
    const userDataDir = path.join(this.sessionsPath, sessionId);
    try {
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      const singletonLock = path.join(userDataDir, 'SingletonLock');
      if (fs.existsSync(singletonLock)) {
        fs.rmSync(singletonLock, { force: true });
        logger.warn(`Removed stale SingletonLock for session ${sessionId}`);
      }
    } catch (fsError) {
      logger.warn(`Failed to prepare userDataDir for ${sessionId}:`, fsError);
    }

    // Create WhatsApp client using the exact working demo configuration
    const client = await create({
      session: sessionId,
      catchQR: (base64Qr: string, asciiQR: string, attempts: number) => {
        this.handleQRCode(sessionId, base64Qr, attempts);
      },
      statusFind: (statusSession: string, session: string) => {
        this.handleStatusChange(sessionId, statusSession);
      },
      headless: true,
      logQR: false,
      autoClose: 0, // Disable auto-close completely
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
      puppeteerOptions: {
        userDataDir,
      },
    });

    clientInfo.client = client;
    clientInfo.isConnecting = false;

    // Set up message listeners
    client.onMessage(async (message: any) => {
      await this.handleIncomingMessage(sessionId, message);
    });

    client.onAck(async (ack: any) => {
      await this.handleMessageAck(sessionId, ack);
    });

    client.onStateChange(async (state: any) => {
      logger.info(`State change for ${sessionId}:`, state);
      await this.handleStatusChange(sessionId, state);
    });
  }

  /**
   * Handle QR code generation - FIXED for immediate display like working demo
   */
  private async handleQRCode(sessionId: string, base64Qr: string, attempts: number): Promise<void> {
    logger.info(`QR Code generated for session ${sessionId}, attempt ${attempts}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo) {
      logger.warn(`No client info found for session ${sessionId} during QR generation`);
      return;
    }

    // Ignore QR events if session is already connected
    if (clientInfo.status === 'CONNECTED') {
      logger.warn(`Ignoring QR event for already CONNECTED session ${sessionId}`);
      return;
    }

    // Persist in-memory QR state
    clientInfo.qrData = base64Qr;
    clientInfo.qrAttempts = attempts;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 20);
    clientInfo.qrExpiresAt = expiresAt;
    clientInfo.status = 'QR';

    // Broadcast QR update immediately
    this.broadcastQRUpdate(sessionId, base64Qr, attempts, expiresAt);

    // Save QR event in DB (best-effort)
    try {
      const session = await Session.findOne({ sessionId }).select('userId').lean();
      if (session) {
        await QREvent.createQREvent(session.userId.toString(), sessionId, base64Qr, 20);
      }
    } catch (error) {
      logger.warn('Failed to persist QR event:', error);
    }
  }

  /**
   * Immediate QR broadcast (like working demo)
   */
  private broadcastQRUpdate(
    sessionId: string,
    qrData: string,
    attempts: number,
    expiresAt: Date
  ): void {
    try {
      const qrPayload = {
        sessionId,
        qrData,
        expiresAt: expiresAt,
        tries: attempts,
        remainingTime: expiresAt.getTime() - Date.now(),
        timestamp: new Date().toISOString(),
      };

      // Use setImmediate for immediate broadcast with retry mechanism
      setImmediate(async () => {
        await this.retryBroadcastQR(sessionId, qrPayload, attempts, 0);
      });
    } catch (error) {
      logger.error('Failed to setup QR broadcast:', error);
    }
  }

  /**
   * Retry QR broadcast with exponential backoff when Socket.IO is not ready
   */
  private async retryBroadcastQR(
    sessionId: string,
    qrPayload: any,
    attempts: number,
    retryCount: number
  ): Promise<void> {
    const maxRetries = 5;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds

    try {
      const { SocketIOService } = await import('../services/socketio.service');
      const socketService = SocketIOService.getInstance();

      if (!socketService.isServerAvailable()) {
        if (retryCount < maxRetries) {
          logger.info(
            `Socket.IO not ready, retrying QR broadcast in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`
          );
          setTimeout(() => {
            this.retryBroadcastQR(sessionId, qrPayload, attempts, retryCount + 1);
          }, retryDelay);
          return;
        } else {
          logger.warn(
            `Failed to broadcast QR after ${maxRetries} retries - Socket.IO still not available`
          );
          return;
        }
      }

      // Resolve userId for broadcasting to the correct user room
      const session = await Session.findOne({ sessionId }).select('userId').lean();
      if (!session) {
        logger.warn(`Cannot broadcast QR: session not found ${sessionId}`);
        return;
      }
      const userId = session.userId.toString();

      // Socket.IO is available - proceed with broadcast
      const qrBroadcastSuccess = socketService.broadcastToUser(userId, 'qr:update', qrPayload);

      // Also broadcast status change immediately
      const statusBroadcastSuccess = socketService.broadcastToUser(userId, 'session:state', {
        sessionId,
        status: 'QR',
        timestamp: new Date().toISOString(),
      });

      logger.info(`QR broadcast completed for ${sessionId}:`, {
        qrBroadcast: qrBroadcastSuccess,
        statusBroadcast: statusBroadcastSuccess,
        attempts,
        retries: retryCount,
      });
    } catch (broadcastError) {
      if (retryCount < maxRetries) {
        logger.warn(`QR broadcast failed, retrying in ${retryDelay}ms:`, broadcastError);
        setTimeout(() => {
          this.retryBroadcastQR(sessionId, qrPayload, attempts, retryCount + 1);
        }, retryDelay);
      } else {
        logger.error('Failed to broadcast QR after all retries:', broadcastError);
      }
    }
  }

  /**
   * Handle status changes - FIXED for immediate updates like working demo
   */
  private async handleStatusChange(sessionId: string, status: string): Promise<void> {
    logger.info(`Status change for ${sessionId}: ${status}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo) {
      logger.warn(`No client info found for session ${sessionId} during status change`);
      return;
    }

    // Debounce rapid status changes (prevent flickering)
    const now = new Date();
    if (
      clientInfo.lastStatusChange &&
      now.getTime() - clientInfo.lastStatusChange.getTime() < 2000
    ) {
      logger.debug(
        `Debouncing status change for ${sessionId}: ${status} (last change: ${clientInfo.lastStatusChange})`
      );
      clientInfo.pendingStatusChange = status;

      // Set timeout to process pending change if no new changes come in
      setTimeout(() => {
        if (clientInfo.pendingStatusChange === status) {
          logger.debug(`Processing debounced status change for ${sessionId}: ${status}`);
          clientInfo.pendingStatusChange = undefined;
          this.handleStatusChange(sessionId, status);
        }
      }, 2000);
      return;
    }

    clientInfo.lastStatusChange = now;
    clientInfo.pendingStatusChange = undefined;

    // Get session info quickly
    const session = await Session.findOne({ sessionId }).select('userId').lean();
    if (!session) {
      logger.error(`Session not found in database: ${sessionId}`);
      return;
    }

    const userId = session.userId.toString();
    let newStatus: SessionStatus;
    let eventPayload: any = {
      oldStatus: clientInfo.status,
      newStatus: status,
      timestamp: new Date().toISOString(),
    };

    // Map status immediately (like working demo) with comprehensive status handling
    switch (status) {
      case 'isLogged':
      case 'CONNECTED':
      case 'authenticated':
      case 'ready':
        newStatus = SessionStatus.CONNECTED;
        clientInfo.status = 'CONNECTED';
        clientInfo.connectionTime = new Date();
        clientInfo.qrData = undefined; // Clear QR data when connected
        eventPayload.connectionEstablished = true;
        break;

      case 'notLogged':
      case 'DISCONNECTED':
      case 'disconnected':
        newStatus = SessionStatus.DISCONNECTED;
        clientInfo.status = 'DISCONNECTED';
        break;

      case 'browserClose':
      case 'serverClose':
      case 'closed':
        newStatus = SessionStatus.EXPIRED;
        clientInfo.status = 'DISCONNECTED';
        eventPayload.reason = 'browser_closed';
        break;

      case 'desconnectedMobile':
      case 'inChat':
      case 'chatsAvailable':
        // These are normal WhatsApp statuses - don't change session status
        // Just log and return without updating database
        logger.debug(`Ignoring normal WhatsApp status: ${status} for session ${sessionId}`);
        return;

      case 'qrReadSuccess':
      case 'qrRead':
        // QR was scanned, but not yet fully connected
        newStatus = SessionStatus.PENDING;
        clientInfo.status = 'INITIALIZING';
        eventPayload.qrScanned = true;
        break;

      case 'qrReadError':
      case 'auth_failure':
        newStatus = SessionStatus.ERROR;
        clientInfo.status = 'ERROR';
        clientInfo.errorCount++;
        eventPayload.error = status;
        break;

      case 'autocloseCalled':
        // Don't treat autoclose as error - it might be normal behavior
        logger.warn(`AutoClose called for session ${sessionId} - attempting recovery`);
        // Try to recover the session instead of marking as error
        setTimeout(() => {
          this.recoverSession(sessionId);
        }, 5000);
        return;

      default:
        logger.info(`Unhandled status for ${sessionId}: ${status}`);
        return;
    }

    clientInfo.lastActivity = new Date();

    // IMMEDIATE broadcast like working demo
    this.broadcastStatusChange(sessionId, newStatus, clientInfo, status);

    // Background database operations (non-blocking like working demo)
    setImmediate(async () => {
      try {
        // Get device info for connected sessions with retry mechanism
        if (newStatus === SessionStatus.CONNECTED && clientInfo.client) {
          // Try multiple methods to get device info with retries
          let deviceInfoRetrieved = false;
          const maxRetries = 3;

          for (let attempt = 1; attempt <= maxRetries && !deviceInfoRetrieved; attempt++) {
            try {
              logger.info(
                `Attempting to get device info for ${sessionId} (attempt ${attempt}/${maxRetries})`
              );

              // Wait a bit for WhatsApp to fully initialize
              if (attempt > 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
              }

              // Try multiple methods to get phone number
              let phoneNumber = null;
              let deviceName = clientInfo.deviceInfo?.name || 'WhatsApp Web';

              // Method 1: getHostDevice
              try {
                const hostDevice = await clientInfo.client.getHostDevice();
                if (hostDevice && hostDevice.wid) {
                  phoneNumber = hostDevice.wid._serialized.split('@')[0];
                  deviceName = hostDevice.pushname || deviceName;
                  logger.info(`Got device info via getHostDevice for ${sessionId}: ${phoneNumber}`);
                }
              } catch (hostDeviceError) {
                logger.warn(`getHostDevice failed for ${sessionId}:`, hostDeviceError);
              }

              // Method 2: getWid (alternative method)
              if (!phoneNumber) {
                try {
                  const wid: any = await clientInfo.client.getWid();
                  if (wid && wid._serialized) {
                    phoneNumber = wid._serialized.split('@')[0];
                    logger.info(`Got phone number via getWid for ${sessionId}: ${phoneNumber}`);
                  }
                } catch (widError) {
                  logger.warn(`getWid failed for ${sessionId}:`, widError);
                }
              }

              // Method 3: Try to get from session info
              if (!phoneNumber) {
                try {
                  const sessionInfo: any = await clientInfo.client.getSessionTokenBrowser();
                  if (sessionInfo && sessionInfo.me) {
                    phoneNumber = sessionInfo.me.split('@')[0];
                    logger.info(
                      `Got phone number via session info for ${sessionId}: ${phoneNumber}`
                    );
                  }
                } catch (sessionError) {
                  logger.warn(`Session info failed for ${sessionId}:`, sessionError);
                }
              }

              if (phoneNumber) {
                // Format phone number properly
                const formattedPhone = phoneNumber.startsWith('+')
                  ? phoneNumber
                  : `+${phoneNumber}`;

                clientInfo.phone = formattedPhone;
                clientInfo.deviceInfo = {
                  name: deviceName,
                  platform: 'WhatsApp Web',
                  version: 'Unknown',
                  browser: 'Chrome',
                  os: 'Linux',
                };

                eventPayload = {
                  ...eventPayload,
                  deviceInfo: clientInfo.deviceInfo,
                  phone: clientInfo.phone,
                };

                deviceInfoRetrieved = true;
                logger.info(
                  `Device info successfully retrieved for ${sessionId}: ${formattedPhone}`
                );

                // Broadcast updated device info
                this.broadcastStatusChange(sessionId, newStatus, clientInfo, status);
                break;
              }
            } catch (deviceError) {
              logger.warn(
                `Device info retrieval attempt ${attempt} failed for ${sessionId}:`,
                deviceError
              );
            }
          }

          if (!deviceInfoRetrieved) {
            logger.error(
              `Failed to retrieve device info for ${sessionId} after ${maxRetries} attempts`
            );
            // Preserve existing device name if available, otherwise use 'Unknown'
            const existingDeviceName = clientInfo.deviceInfo?.name;
            clientInfo.deviceInfo = {
              name: existingDeviceName || 'Unknown',
              platform: 'WhatsApp Web',
              version: 'Unknown',
              browser: 'Chrome',
              os: 'Linux',
            };
          }
        }

        // Update database with new status and device info (with error handling)
        try {
          await Session.updateStatus(sessionId, newStatus);
          logger.debug(`Status updated in database for ${sessionId}: ${status} -> ${newStatus}`);
        } catch (dbError) {
          logger.error(`Failed to update session status in database for ${sessionId}:`, dbError);
        }

        // Always update lastSeenAt for connected sessions, and device info if available
        if (newStatus === SessionStatus.CONNECTED) {
          try {
            const updateData: any = {
              lastSeenAt: new Date(),
            };

            // Add phone and device info if available
            if (clientInfo.phone) {
              updateData.phone = clientInfo.phone;
            }
            if (clientInfo.deviceInfo) {
              updateData.deviceInfo = clientInfo.deviceInfo;
            }

            await Session.findOneAndUpdate({ sessionId }, { $set: updateData });

            logger.debug(`Session data updated in database for ${sessionId}:`, {
              phone: clientInfo.phone || 'Not retrieved',
              lastSeenAt: updateData.lastSeenAt,
              deviceName: clientInfo.deviceInfo?.name || 'Unknown',
            });
          } catch (deviceUpdateError) {
            logger.error(
              `Failed to update session data in database for ${sessionId}:`,
              deviceUpdateError
            );
          }
        }

        // Record event with webhook delivery (with error handling)
        try {
          await EventService.recordSessionStateChange(
            userId,
            sessionId,
            eventPayload.oldStatus,
            newStatus,
            eventPayload.deviceInfo,
            eventPayload.phone,
            eventPayload.error
          );
          logger.debug(`Event recorded for ${sessionId}: ${status} -> ${newStatus}`);
        } catch (eventError) {
          logger.error(`Failed to record event for ${sessionId}:`, eventError);
        }

        // Trigger email notifications for status changes (non-blocking)
        try {
          const oldStatusEnum = this.mapStatusToEnum(eventPayload.oldStatus);
          const newStatusEnum = newStatus;
          
          await WPPNotificationHandler.handleSessionStateChange(
            sessionId,
            oldStatusEnum,
            newStatusEnum,
            eventPayload.error || status
          );
        } catch (notificationError) {
          logger.error(`Failed to trigger notification for ${sessionId}:`, notificationError);
        }
      } catch (error) {
        logger.error('Failed to process status change in background:', error);
      }
    });
  }

  /**
   * Immediate status broadcast (like working demo)
   */
  private broadcastStatusChange(
    sessionId: string,
    newStatus: SessionStatus,
    clientInfo: ClientInfo,
    originalStatus: string
  ): void {
    const broadcastPayload = {
      sessionId,
      status: newStatus,
      phone: clientInfo.phone,
      deviceInfo: clientInfo.deviceInfo,
      timestamp: new Date().toISOString(),
      originalStatus,
    };

    // Primary broadcast via SocketIOService with retry mechanism
    setImmediate(async () => {
      await this.retryBroadcastStatus(sessionId, broadcastPayload, newStatus, originalStatus, 0);
    });
  }

  /**
   * Retry status broadcast with exponential backoff when Socket.IO is not ready
   */
  private async retryBroadcastStatus(
    sessionId: string,
    broadcastPayload: any,
    newStatus: SessionStatus,
    originalStatus: string,
    retryCount: number
  ): Promise<void> {
    const maxRetries = 5;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds

    try {
      const { SocketIOService } = await import('../services/socketio.service');
      const socketService = SocketIOService.getInstance();

      if (!socketService.isServerAvailable()) {
        if (retryCount < maxRetries) {
          logger.info(
            `Socket.IO not ready, retrying status broadcast in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`
          );
          setTimeout(() => {
            this.retryBroadcastStatus(
              sessionId,
              broadcastPayload,
              newStatus,
              originalStatus,
              retryCount + 1
            );
          }, retryDelay);
          return;
        } else {
          logger.warn(
            `Failed to broadcast status after ${maxRetries} retries - Socket.IO still not available`
          );
          return;
        }
      }

      // Resolve userId for broadcasting
      const session = await Session.findOne({ sessionId }).select('userId').lean();
      if (!session) {
        logger.warn(`Cannot broadcast status: session not found ${sessionId}`);
        return;
      }
      const userId = session.userId.toString();

      // Socket.IO is available - proceed with broadcast
      const broadcastSuccess = socketService.broadcastToUser(
        userId,
        'session:state',
        broadcastPayload
      );

      logger.info(`Status broadcast completed for ${sessionId}:`, {
        newStatus,
        originalStatus,
        broadcastSuccess,
        retries: retryCount,
      });
    } catch (broadcastError) {
      if (retryCount < maxRetries) {
        logger.warn(`Status broadcast failed, retrying in ${retryDelay}ms:`, broadcastError);
        setTimeout(() => {
          this.retryBroadcastStatus(
            sessionId,
            broadcastPayload,
            newStatus,
            originalStatus,
            retryCount + 1
          );
        }, retryDelay);
      } else {
        logger.error('Failed to broadcast status change after all retries:', broadcastError);
      }
    }
  }

  private async handleIncomingMessage(sessionId: string, message: any): Promise<void> {
    logger.info(`Incoming message for ${sessionId}:`, {
      from: message.from,
      type: message.type,
      body: message.body?.substring(0, 100),
    });

    try {
      const session = await Session.findOne({ sessionId });
      if (!session) return;

      const userId = session.userId.toString();
      const clientInfo = this.clients.get(sessionId);

      // Try to extract phone number from message metadata if not already set
      if (clientInfo && (!clientInfo.phone || clientInfo.phone === 'Unknown')) {
        try {
          // Check if message has 'to' field which might contain our phone number
          if (message.to && message.to.includes('@')) {
            const phoneFromMessage = message.to.split('@')[0];
            if (phoneFromMessage && phoneFromMessage.length > 5) {
              const formattedPhone = phoneFromMessage.startsWith('+')
                ? phoneFromMessage
                : `+${phoneFromMessage}`;

              logger.info(
                `Extracted phone number from message metadata for ${sessionId}: ${formattedPhone}`
              );

              // Update in-memory client info
              clientInfo.phone = formattedPhone;

              // Update database
              await Session.findOneAndUpdate(
                { sessionId },
                {
                  $set: {
                    phone: formattedPhone,
                    lastSeenAt: new Date(),
                  },
                }
              );

              logger.info(`Phone number updated in database for ${sessionId}: ${formattedPhone}`);
            }
          }
        } catch (phoneExtractionError) {
          logger.warn(
            `Failed to extract phone from message for ${sessionId}:`,
            phoneExtractionError
          );
        }
      }

      // Update lastSeenAt for any message activity
      if (clientInfo) {
        clientInfo.lastActivity = new Date();
        this.updateLastSeenAt(sessionId);
      }

      // Record incoming message event
      await EventService.recordEvent({
        userId,
        sessionId,
        type: EventType.MESSAGE_DELIVERED, // More appropriate for incoming messages
        payload: {
          messageId: message.id,
          from: message.from,
          type: message.type,
          body: message.body,
          timestamp: message.timestamp,
        },
      });
    } catch (error) {
      logger.error('Failed to handle incoming message:', error);
    }
  }

  private async handleMessageAck(sessionId: string, ack: any): Promise<void> {
    logger.info(`Message ACK for ${sessionId}:`, ack);

    try {
      const session = await Session.findOne({ sessionId });
      if (!session) return;

      const userId = session.userId.toString();

      // Find the message in our database
      const message = await Message.findOne({
        sessionId,
        'metadata.wppMessageId': ack.id,
      });

      if (message) {
        let newStatus: MessageStatus;
        let eventType: EventType;

        switch (ack.ack) {
          case 1: // Sent
            newStatus = MessageStatus.SENT;
            eventType = EventType.MESSAGE_SENT;
            break;
          case 2: // Delivered
            newStatus = MessageStatus.DELIVERED;
            eventType = EventType.MESSAGE_DELIVERED;
            break;
          case 3: // Read
            newStatus = MessageStatus.READ;
            eventType = EventType.MESSAGE_READ;
            break;
          default:
            return;
        }

        // Update message status
        await Message.updateStatus(message.messageId, newStatus);

        // Record event with webhook delivery
        switch (eventType) {
          case EventType.MESSAGE_SENT:
            await EventService.recordMessageSent(
              userId,
              sessionId,
              message.messageId,
              message.to,
              message.type
            );
            break;
          case EventType.MESSAGE_DELIVERED:
            await EventService.recordMessageDelivered(userId, sessionId, message.messageId);
            break;
          case EventType.MESSAGE_READ:
            await EventService.recordMessageRead(userId, sessionId, message.messageId);
            break;
        }
      }
    } catch (error) {
      logger.error('Failed to handle message ACK:', error);
    }
  }

  async destroyClient(sessionId: string): Promise<void> {
    logger.info(`Destroying WPP client: ${sessionId}`);

    const clientInfo = this.clients.get(sessionId);

    // Graceful client shutdown
    if (clientInfo && clientInfo.client) {
      try {
        // Set status to disconnecting
        clientInfo.status = 'DISCONNECTED';

        // Close the client with timeout
        const closePromise = clientInfo.client.close();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Client close timeout')), 10000)
        );

        await Promise.race([closePromise, timeoutPromise]);
        logger.info(`Client closed successfully for session: ${sessionId}`);
      } catch (error) {
        logger.error(`Error closing client ${sessionId}:`, error);
        // Force close if graceful close fails
        try {
          if (clientInfo.client && typeof (clientInfo.client as any).kill === 'function') {
            await (clientInfo.client as any).kill();
          }
        } catch (killError) {
          logger.error(`Error force-killing client ${sessionId}:`, killError);
        }
      }
    }

    // Remove from clients map
    this.clients.delete(sessionId);

    // Clean up session files with proper error handling
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);

      if (fs.existsSync(sessionPath)) {
        // Get file stats for logging
        const stats = fs.statSync(sessionPath);
        const sizeKB = Math.round(stats.size / 1024);

        // Remove session directory
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info(`Session files deleted: ${sessionPath} (${sizeKB}KB)`);
      } else {
        logger.debug(`No session files found to delete for: ${sessionId}`);
      }
    } catch (error) {
      logger.error(`Error deleting session files for ${sessionId}:`, error);
    }

    // Update session status in database
    try {
      await Session.updateStatus(sessionId, SessionStatus.EXPIRED);
      logger.debug(`Session status updated to EXPIRED in database: ${sessionId}`);
    } catch (dbError) {
      logger.error(`Failed to update session status in database for ${sessionId}:`, dbError);
    }

    // Broadcast session destruction
    try {
      const session = await Session.findOne({ sessionId }).select('userId').lean();
      if (session) {
        const { SocketIOService } = await import('../services/socketio.service');
        const socketService = SocketIOService.getInstance();

        socketService.broadcastToUser(session.userId.toString(), 'session:state', {
          sessionId,
          status: 'EXPIRED',
          timestamp: new Date().toISOString(),
          destroyed: true,
        });

        logger.debug(`Session destruction broadcasted for: ${sessionId}`);
      }
    } catch (broadcastError) {
      logger.warn(`Failed to broadcast session destruction for ${sessionId}:`, broadcastError);
    }

    logger.info(`Session destruction completed: ${sessionId}`);
  }

  async refreshQR(sessionId: string): Promise<void> {
    logger.info(`Refreshing QR: ${sessionId}`);

    const clientInfo = this.clients.get(sessionId);

    // If already connected, do not restart or generate QR again
    if (clientInfo && clientInfo.status === 'CONNECTED') {
      logger.info(`Session ${sessionId} already CONNECTED, skipping QR refresh.`);
      return;
    }

    if (clientInfo && clientInfo.client) {
      // Existing client - restart it for new QR
      try {
        logger.info(`Restarting existing client for QR refresh: ${sessionId}`);
        await clientInfo.client.close();
        // Re-initialize the client
        const config: WPPConfig = {
          session: sessionId,
          headless: true,
          devtools: false,
          useChrome: true,
          debug: false,
          logQR: false,
          browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
        };
        await this.initializeClient(sessionId, config);
      } catch (error) {
        logger.error(`Error refreshing QR for existing client ${sessionId}:`, error);
      }
    } else {
      // No client exists (DISCONNECTED session) - create new one
      try {
        logger.info(`Creating new client for DISCONNECTED session: ${sessionId}`);

        // Get session info from database
        const session = await Session.findOne({ sessionId }).lean();
        if (!session) {
          throw new Error(`Session ${sessionId} not found in database`);
        }

        // Initialize new client for the session
        const config: WPPConfig = {
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
        };

        await this.initializeClient(sessionId, config);
        logger.info(`Successfully initiated reconnection for session: ${sessionId}`);
      } catch (error) {
        logger.error(`Error creating new client for DISCONNECTED session ${sessionId}:`, error);
        throw error;
      }
    }
  }

  /**
   * Send text message - FIXED to check in-memory session state
   */
  async sendTextMessage(sessionId: string, to: string, content: string): Promise<any> {
    logger.info(`Sending text message: ${sessionId} -> ${to}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      throw new Error('Session not found or not connected. Please check session status.');
    }

    if (clientInfo.status !== 'CONNECTED') {
      throw new Error(`Session is not connected. Current status: ${clientInfo.status}`);
    }

    try {
      // Format phone number for WPPConnect (remove + sign)
      const formattedTo = to.startsWith('+') ? to.substring(1) : to;
      logger.info(`Formatted phone number: ${to} -> ${formattedTo}`);

      const result = await clientInfo.client.sendText(formattedTo, content);
      clientInfo.messageCount++;
      clientInfo.lastActivity = new Date();
      return result;
    } catch (error) {
      logger.error(`Failed to send text message:`, error);
      throw error;
    }
  }

  /**
   * Update lastSeenAt timestamp in database
   */
  private async updateLastSeenAt(sessionId: string): Promise<void> {
    try {
      await Session.findOneAndUpdate({ sessionId }, { $set: { lastSeenAt: new Date() } });
    } catch (error) {
      logger.warn(`Failed to update lastSeenAt for ${sessionId}:`, error);
    }
  }

  /**
   * Manually set phone number for a session
   */
  async setSessionPhone(sessionId: string, phoneNumber: string): Promise<void> {
    try {
      const clientInfo = this.clients.get(sessionId);
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Update in-memory client info
      if (clientInfo) {
        clientInfo.phone = formattedPhone;
      }

      // Update database
      await Session.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            phone: formattedPhone,
            lastSeenAt: new Date(),
          },
        }
      );

      logger.info(`Phone number manually set for ${sessionId}: ${formattedPhone}`);
    } catch (error) {
      logger.error(`Failed to set phone number for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Try alternative methods to get phone number
   */
  async tryGetPhoneNumber(sessionId: string): Promise<string | null> {
    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      return null;
    }

    const methods = [
      // Method 1: Check if client has a phone property
      async () => {
        try {
          const phone = (clientInfo.client as any).phone;
          if (phone) return phone;
        } catch (error) {
          logger.debug(`Phone property check failed for ${sessionId}:`, error);
        }
        return null;
      },

      // Method 2: Try to get from connection info
      async () => {
        try {
          const info = await clientInfo.client.getConnectionState();
          if (info && (info as any).phone) {
            return (info as any).phone;
          }
        } catch (error) {
          logger.debug(`Connection state check failed for ${sessionId}:`, error);
        }
        return null;
      },

      // Method 3: Try to send a test message to ourselves to capture the number
      async () => {
        try {
          // This is a bit hacky but might work
          const testResult = await clientInfo.client.sendText('status@broadcast', 'test');
          if (testResult && testResult.from) {
            return testResult.from.split('@')[0];
          }
        } catch (error) {
          logger.debug(`Test message method failed for ${sessionId}:`, error);
        }
        return null;
      },
    ];

    for (let i = 0; i < methods.length; i++) {
      try {
        const result = await methods[i]();
        if (result) {
          logger.info(`Phone number retrieved using method ${i + 1} for ${sessionId}: ${result}`);
          return result;
        }
      } catch (error) {
        logger.debug(`Method ${i + 1} failed for ${sessionId}:`, error);
      }
    }

    return null;
  }

  /**
   * Get QR data from memory (like working demo)
   */
  getQRData(sessionId: string): { qrData: string; expiresAt: Date; attempts: number } | null {
    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.qrData || !clientInfo.qrExpiresAt) {
      return null;
    }

    if (clientInfo.qrExpiresAt <= new Date()) {
      return null; // QR expired
    }

    return {
      qrData: clientInfo.qrData,
      expiresAt: clientInfo.qrExpiresAt,
      attempts: clientInfo.qrAttempts || 1,
    };
  }

  /**
   * Check if session is ready for messaging
   */
  isSessionReady(sessionId: string): boolean {
    const clientInfo = this.clients.get(sessionId);
    return !!(clientInfo && clientInfo.client && clientInfo.status === 'CONNECTED');
  }

  /**
   * Get session status from memory
   */
  getSessionStatus(sessionId: string): string | null {
    const clientInfo = this.clients.get(sessionId);
    return clientInfo ? clientInfo.status : null;
  }

  async sendImageMessage(
    sessionId: string,
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<any> {
    logger.info(`Sending image message: ${sessionId} -> ${to}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      throw new Error('Session not found or not connected');
    }

    if (clientInfo.status !== 'CONNECTED') {
      throw new Error('Session is not connected');
    }

    try {
      // Format phone number for WPPConnect (remove + sign)
      const formattedTo = to.startsWith('+') ? to.substring(1) : to;

      const result = await clientInfo.client.sendImage(
        formattedTo,
        imageUrl,
        'image',
        caption || ''
      );
      clientInfo.messageCount++;
      clientInfo.lastActivity = new Date();
      return result;
    } catch (error) {
      logger.error(`Failed to send image message:`, error);
      throw error;
    }
  }

  async sendDocumentMessage(
    sessionId: string,
    to: string,
    documentUrl: string,
    filename?: string
  ): Promise<any> {
    logger.info(`Sending document message: ${sessionId} -> ${to}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      throw new Error('Session not found or not connected');
    }

    if (clientInfo.status !== 'CONNECTED') {
      throw new Error('Session is not connected');
    }

    try {
      // Format phone number for WPPConnect (remove + sign)
      const formattedTo = to.startsWith('+') ? to.substring(1) : to;

      const result = await clientInfo.client.sendFile(
        formattedTo,
        documentUrl,
        filename || 'document'
      );
      clientInfo.messageCount++;
      clientInfo.lastActivity = new Date();
      return result;
    } catch (error) {
      logger.error(`Failed to send document message:`, error);
      throw error;
    }
  }

  async sendAudioMessage(sessionId: string, to: string, audioUrl: string): Promise<any> {
    logger.info(`Sending audio message: ${sessionId} -> ${to}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      throw new Error('Session not found or not connected');
    }

    if (clientInfo.status !== 'CONNECTED') {
      throw new Error('Session is not connected');
    }

    try {
      // Format phone number for WPPConnect (remove + sign)
      const formattedTo = to.startsWith('+') ? to.substring(1) : to;

      const result = await clientInfo.client.sendPtt(formattedTo, audioUrl);
      clientInfo.messageCount++;
      clientInfo.lastActivity = new Date();
      return result;
    } catch (error) {
      logger.error(`Failed to send audio message:`, error);
      throw error;
    }
  }

  async sendVideoMessage(
    sessionId: string,
    to: string,
    videoUrl: string,
    caption?: string
  ): Promise<any> {
    logger.info(`Sending video message: ${sessionId} -> ${to}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      throw new Error('Session not found or not connected');
    }

    if (clientInfo.status !== 'CONNECTED') {
      throw new Error('Session is not connected');
    }

    try {
      // Format phone number for WPPConnect (remove + sign)
      const formattedTo = to.startsWith('+') ? to.substring(1) : to;

      const result = await clientInfo.client.sendVideoAsGif(
        formattedTo,
        videoUrl,
        'video',
        caption || ''
      );
      clientInfo.messageCount++;
      clientInfo.lastActivity = new Date();
      return result;
    } catch (error) {
      logger.error(`Failed to send video message:`, error);
      throw error;
    }
  }

  async sendLocationMessage(
    sessionId: string,
    to: string,
    latitude: number,
    longitude: number,
    address?: string
  ): Promise<any> {
    logger.info(`Sending location message: ${sessionId} -> ${to}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo || !clientInfo.client) {
      throw new Error('Session not found or not connected');
    }

    if (clientInfo.status !== 'CONNECTED') {
      throw new Error('Session is not connected');
    }

    try {
      // Format phone number for WPPConnect (remove + sign)
      const formattedTo = to.startsWith('+') ? to.substring(1) : to;

      const result = await clientInfo.client.sendLocation(
        formattedTo,
        latitude.toString(),
        longitude.toString(),
        address || ''
      );
      clientInfo.messageCount++;
      clientInfo.lastActivity = new Date();
      return result;
    } catch (error) {
      logger.error(`Failed to send location message:`, error);
      throw error;
    }
  }

  getClientInfo(sessionId: string): ClientInfo | undefined {
    return this.clients.get(sessionId);
  }

  getAllClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  getMetrics(): ClientMetrics {
    const clients = Array.from(this.clients.values());

    return {
      totalClients: clients.length,
      connectedClients: clients.filter((c) => c.status === 'CONNECTED').length,
      qrClients: clients.filter((c) => c.status === 'QR').length,
      errorClients: clients.filter((c) => c.status === 'ERROR').length,
      memoryUsage: process.memoryUsage().heapUsed,
      averageConnectionTime: this.calculateAverageConnectionTime(clients),
      totalMessages: clients.reduce((sum, c) => sum + c.messageCount, 0),
      errorRate: this.calculateErrorRate(clients),
    };
  }

  private calculateAverageConnectionTime(clients: ClientInfo[]): number {
    const connectedClients = clients.filter((c) => c.connectionTime);
    if (connectedClients.length === 0) return 0;

    const totalTime = connectedClients.reduce((sum, c) => {
      if (c.connectionTime) {
        return sum + (c.connectionTime.getTime() - c.createdAt.getTime());
      }
      return sum;
    }, 0);

    return totalTime / connectedClients.length;
  }

  private calculateErrorRate(clients: ClientInfo[]): number {
    if (clients.length === 0) return 0;
    const errorClients = clients.filter((c) => c.errorCount > 0).length;
    return (errorClients / clients.length) * 100;
  }

  /**
   * Clean up session data to prevent conflicts
   */
  private async cleanupSessionData(sessionId: string): Promise<void> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);

      // Remove existing session directory if it exists
      if (fs.existsSync(sessionPath)) {
        logger.info(`Cleaning up existing session data for: ${sessionId}`);
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      // Clean up any existing client info
      if (this.clients.has(sessionId)) {
        const existingClient = this.clients.get(sessionId);
        if (existingClient?.client) {
          try {
            await existingClient.client.close();
          } catch (error) {
            logger.warn(`Error closing existing client ${sessionId}:`, error);
          }
        }
        this.clients.delete(sessionId);
      }

      logger.debug(`Session data cleanup completed for: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to cleanup session data for ${sessionId}:`, error);
    }
  }

  /**
   * Health monitoring and recovery system
   */
  private healthCheckInterval?: NodeJS.Timeout;

  private startHealthMonitoring(): void {
    // Run health check every 15 minutes (less aggressive)
    this.healthCheckInterval = setInterval(
      async () => {
        await this.performHealthCheck();
      },
      15 * 60 * 1000
    );

    logger.info('Session health monitoring started (15 minute intervals)');
  }

  private async performHealthCheck(): Promise<void> {
    try {
      logger.debug('Performing session health check...');

      const healthyClients: string[] = [];
      const unhealthyClients: string[] = [];
      const staleClients: string[] = [];

      for (const [sessionId, clientInfo] of this.clients.entries()) {
        try {
          // Check if client is stale (no activity for 2 hours - more lenient)
          const timeSinceActivity = Date.now() - clientInfo.lastActivity.getTime();
          const isStale = timeSinceActivity > 2 * 60 * 60 * 1000; // 2 hours

          if (isStale) {
            staleClients.push(sessionId);
            continue;
          }

          // Check client health - be more lenient
          if (clientInfo.client && clientInfo.status === 'CONNECTED') {
            try {
              // Try to get connection state with longer timeout
              const state = await Promise.race([
                clientInfo.client.getConnectionState(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Health check timeout')), 30000)
                ),
              ]);

              if (state === 'CONNECTED' || state === 'OPENING' || state === 'PAIRING') {
                healthyClients.push(sessionId);
                // Update last activity to prevent false positives
                clientInfo.lastActivity = new Date();

                // Update lastSeenAt in database for connected sessions
                this.updateLastSeenAt(sessionId);
              } else {
                // Don't immediately mark as unhealthy, give it another chance
                logger.warn(`Session state check: ${sessionId}, state: ${state}`);
                healthyClients.push(sessionId); // Keep as healthy for now
              }
            } catch (healthError) {
              // Don't immediately mark as unhealthy on health check failure
              logger.warn(`Health check failed for session: ${sessionId}`, healthError);
              healthyClients.push(sessionId); // Keep as healthy for now
            }
          } else if (clientInfo.status === 'ERROR' && clientInfo.errorCount > 10) {
            // Increase error threshold before cleanup
            unhealthyClients.push(sessionId);
          }
        } catch (error) {
          logger.error(`Error checking health for session ${sessionId}:`, error);
          unhealthyClients.push(sessionId);
        }
      }

      // Handle stale clients
      for (const sessionId of staleClients) {
        logger.info(`Cleaning up stale session: ${sessionId}`);
        await this.destroyClient(sessionId);
      }

      // Handle unhealthy clients
      for (const sessionId of unhealthyClients) {
        logger.info(`Attempting recovery for unhealthy session: ${sessionId}`);
        await this.recoverSession(sessionId);
      }

      // Log health summary
      if (healthyClients.length > 0 || unhealthyClients.length > 0 || staleClients.length > 0) {
        logger.info('Session health check completed:', {
          healthy: healthyClients.length,
          unhealthy: unhealthyClients.length,
          stale: staleClients.length,
          total: this.clients.size,
        });
      }
    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  private async recoverSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Attempting to recover session: ${sessionId}`);

      const clientInfo = this.clients.get(sessionId);
      if (!clientInfo) {
        logger.warn(`No client info found for recovery: ${sessionId}`);
        return;
      }

      // Get session from database
      const session = await Session.findOne({ sessionId }).lean();
      if (!session) {
        logger.warn(`Session not found in database for recovery: ${sessionId}`);
        await this.destroyClient(sessionId);
        return;
      }

      // Destroy current client
      await this.destroyClient(sessionId);

      // Wait a moment before reinitializing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Reinitialize the session
      await this.initializeClient(sessionId, {
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

      logger.info(`Session recovery initiated: ${sessionId}`);
    } catch (error) {
      logger.error(`Session recovery failed for ${sessionId}:`, error);
      // Mark as error if recovery fails
      try {
        await Session.updateStatus(
          sessionId,
          SessionStatus.ERROR,
          `Recovery failed: ${(error as Error).message}`
        );
      } catch (updateError) {
        logger.error(`Failed to update session status after recovery failure:`, updateError);
      }
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up WPPConnect Manager');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Gracefully destroy all clients
    const destroyPromises = Array.from(this.clients.keys()).map((sessionId) =>
      this.destroyClient(sessionId).catch((error) =>
        logger.error(`Error destroying client ${sessionId} during cleanup:`, error)
      )
    );

    await Promise.allSettled(destroyPromises);

    this.clients.clear();
    this.isInitialized = false;

    logger.info('WPPConnect Manager cleanup completed');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down WPPConnect Manager');
    await this.cleanup();
  }

  async reconnectClient(sessionId: string): Promise<void> {
    logger.info(`Reconnecting client: ${sessionId}`);

    // Destroy existing client if it exists
    await this.destroyClient(sessionId);

    // Find session in database to get configuration
    const session = await Session.findOne({ sessionId }).lean();
    if (!session) {
      throw new Error('Session not found');
    }

    // Reinitialize the client
    await this.initializeClient(sessionId, {
      session: sessionId,
      deviceName: session.deviceInfo?.name || 'WhatsApp Web',
      headless: true,
      devtools: false,
      useChrome: true,
      debug: false,
      logQR: false,
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }

  /**
   * Helper method to map internal status strings to SessionStatus enum
   */
  private mapStatusToEnum(status: string): SessionStatus {
    switch (status) {
      case 'CONNECTED':
        return SessionStatus.CONNECTED;
      case 'DISCONNECTED':
        return SessionStatus.DISCONNECTED;
      case 'QR':
        return SessionStatus.QR;
      case 'INITIALIZING':
        return SessionStatus.PENDING;
      case 'ERROR':
        return SessionStatus.ERROR;
      default:
        return SessionStatus.PENDING;
    }
  }
}
