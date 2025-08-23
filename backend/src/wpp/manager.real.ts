import { create, Whatsapp } from '@wppconnect-team/wppconnect';
import { logger } from '../utils/logger';
import { Session } from '../models/Session.model';
import { QREvent } from '../models/QREvent.model';
import { Event } from '../models/Event.model';
import { Message } from '../models/Message.model';
import { EventService } from '../services/event.service';
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

      const activeSessions = await Session.find({
        $or: [
          // Recent CONNECTED sessions that might still be valid
          {
            status: SessionStatus.CONNECTED,
            lastSeenAt: { $gte: cutoffTime },
          },
          // QR and PENDING sessions (these should be restored)
          {
            status: { $in: [SessionStatus.QR, SessionStatus.PENDING] },
          },
          // DISCONNECTED sessions that were previously connected (within 24 hours)
          {
            status: SessionStatus.DISCONNECTED,
            lastSeenAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        ],
      })
        .select('sessionId userId deviceInfo status phone lastSeenAt')
        .lean();

      logger.info(`Found ${activeSessions.length} sessions to restore`);

      // Restore each session with proper in-memory state management
      for (const session of activeSessions) {
        try {
          logger.info(`Restoring session: ${session.sessionId} (status: ${session.status})`);

          // Handle CONNECTED sessions - attempt automatic reconnection
          if (session.status === SessionStatus.CONNECTED) {
            logger.info(
              `Found CONNECTED session ${session.sessionId} - attempting automatic reconnection`
            );

            try {
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

              // Try to restore the session automatically
              await this.initializeClientInternal(session.sessionId, {
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

              logger.info(
                `CONNECTED session automatic restoration initiated: ${session.sessionId}`
              );
            } catch (error) {
              logger.warn(
                `CONNECTED session auto-restoration failed for ${session.sessionId}, marking as DISCONNECTED:`,
                error
              );
              // Clean up failed session
              this.clients.delete(session.sessionId);
              // Mark as DISCONNECTED for manual reconnection
              await Session.updateStatus(session.sessionId, SessionStatus.DISCONNECTED);
            }
            continue;
          }

          // Handle DISCONNECTED sessions - check if they might still be connected
          if (session.status === SessionStatus.DISCONNECTED) {
            logger.info(
              `Found DISCONNECTED session ${session.sessionId} - checking if still connected`
            );

            // Try to restore and check connection status
            try {
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

              // Try to restore the session with connection check
              await this.initializeClientInternal(session.sessionId, {
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

              logger.info(`DISCONNECTED session restoration attempted: ${session.sessionId}`);
            } catch (error) {
              logger.info(
                `DISCONNECTED session ${session.sessionId} - keeping as DISCONNECTED for manual reconnection`
              );
              // Clean up failed session
              this.clients.delete(session.sessionId);
            }
            continue;
          }

          // Initialize in-memory client info first (like working demo)
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

          // Initialize the WPP client
          await this.initializeClientInternal(session.sessionId, {
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

          logger.info(`Session restoration completed: ${session.sessionId}`);
        } catch (error) {
          logger.error(`Failed to restore session ${session.sessionId}:`, error);
          // Clean up failed session
          this.clients.delete(session.sessionId);
          await Session.updateStatus(
            session.sessionId,
            SessionStatus.ERROR,
            `Restoration failed: ${(error as Error).message}`
          );
        }
      }

      logger.info('Session restoration completed');
    } catch (error) {
      logger.error('Failed to restore existing sessions:', error);
    }
  }

  async initializeClient(sessionId: string, config: WPPConfig): Promise<void> {
    logger.info(`Initializing WPP client: ${sessionId}`, config);

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
        userDataDir: path.join(this.sessionsPath, sessionId),
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

    // Update in-memory state IMMEDIATELY (like working demo)
    clientInfo.status = 'QR';
    clientInfo.lastActivity = new Date();

    // Ensure QR data is properly formatted
    let formattedQRData = base64Qr;
    if (!base64Qr.startsWith('data:image/')) {
      formattedQRData = `data:image/png;base64,${base64Qr}`;
    }

    // Store QR data in memory for immediate access (like working demo)
    clientInfo.qrData = formattedQRData;
    clientInfo.qrAttempts = attempts;
    clientInfo.qrExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Get session info for broadcasting
    const session = await Session.findOne({ sessionId }).select('userId').lean();
    if (!session) {
      logger.error(`Session not found in database: ${sessionId}`);
      return;
    }

    const userId = session.userId.toString();

    // IMMEDIATE broadcast (synchronous like working demo - NO await)
    this.broadcastQRUpdate(userId, sessionId, formattedQRData, attempts);

    // Background database operations (non-blocking like working demo)
    setImmediate(async () => {
      try {
        // Update session status first
        await Session.updateStatus(sessionId, SessionStatus.QR);

        // Create QR event
        await QREvent.createQREvent(userId, sessionId, formattedQRData, 15);

        // Record event with webhook delivery
        await EventService.recordQRRefresh(
          userId,
          sessionId,
          formattedQRData,
          new Date(Date.now() + 15 * 60 * 1000),
          attempts
        );

        logger.debug(`QR code stored in database for session: ${sessionId}`);
      } catch (error) {
        logger.error('Failed to store QR code in database:', error);
      }
    });
  }

  /**
   * Immediate QR broadcast (like working demo)
   */
  private broadcastQRUpdate(
    userId: string,
    sessionId: string,
    qrData: string,
    attempts: number
  ): void {
    try {
      const qrPayload = {
        sessionId,
        qrData,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        tries: attempts,
        remainingTime: 15 * 60,
        timestamp: new Date().toISOString(),
      };

      // Use setImmediate for immediate broadcast with retry mechanism
      setImmediate(async () => {
        await this.retryBroadcastQR(userId, sessionId, qrPayload, attempts, 0);
      });
    } catch (error) {
      logger.error('Failed to setup QR broadcast:', error);
    }
  }

  /**
   * Retry QR broadcast with exponential backoff when Socket.IO is not ready
   */
  private async retryBroadcastQR(
    userId: string,
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
            this.retryBroadcastQR(userId, sessionId, qrPayload, attempts, retryCount + 1);
          }, retryDelay);
          return;
        } else {
          logger.warn(
            `Failed to broadcast QR after ${maxRetries} retries - Socket.IO still not available`
          );
          return;
        }
      }

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
          this.retryBroadcastQR(userId, sessionId, qrPayload, attempts, retryCount + 1);
        }, retryDelay);
      } else {
        logger.error('Failed to broadcast QR update after all retries:', broadcastError);
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
        // This is just an initial status from WPPConnect - don't treat as error
        // Keep current status or set to QR if we have QR data
        if (clientInfo.qrData && clientInfo.qrExpiresAt && clientInfo.qrExpiresAt > new Date()) {
          newStatus = SessionStatus.QR;
          clientInfo.status = 'QR';
        } else {
          newStatus = SessionStatus.PENDING;
          clientInfo.status = 'INITIALIZING';
        }
        break;

      case 'qrReadError':
      case 'autocloseCalled':
      case 'auth_failure':
        newStatus = SessionStatus.ERROR;
        clientInfo.status = 'ERROR';
        clientInfo.errorCount++;
        eventPayload.error = status;
        break;

      case 'qrReadSuccess':
      case 'qrRead':
        // QR was scanned, but not yet fully connected
        newStatus = SessionStatus.PENDING;
        clientInfo.status = 'INITIALIZING';
        eventPayload.qrScanned = true;
        break;

      default:
        logger.info(`Unhandled status for ${sessionId}: ${status}`);
        return;
    }

    clientInfo.lastActivity = new Date();

    // IMMEDIATE broadcast like working demo
    this.broadcastStatusChange(userId, sessionId, newStatus, clientInfo, status);

    // Background database operations (non-blocking like working demo)
    setImmediate(async () => {
      try {
        // Get device info for connected sessions
        if (newStatus === SessionStatus.CONNECTED && clientInfo.client) {
          try {
            const hostDevice = await clientInfo.client.getHostDevice();
            if (hostDevice && hostDevice.wid) {
              const phoneNumber = hostDevice.wid._serialized.split('@')[0];
              const deviceName = hostDevice.pushname || clientInfo.deviceInfo?.name || 'Unknown';

              clientInfo.phone = phoneNumber;
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
                hostDevice: {
                  pushname: hostDevice.pushname,
                  wid: hostDevice.wid._serialized,
                },
              };

              // Broadcast updated device info
              this.broadcastStatusChange(userId, sessionId, newStatus, clientInfo, status);
            }
          } catch (deviceError) {
            logger.warn(`Failed to get device info for ${sessionId}:`, deviceError);
          }
        }

        // Update database with new status and device info (with error handling)
        try {
          await Session.updateStatus(sessionId, newStatus);
          logger.debug(`Status updated in database for ${sessionId}: ${status} -> ${newStatus}`);
        } catch (dbError) {
          logger.error(`Failed to update session status in database for ${sessionId}:`, dbError);
        }

        // Update device info in database if available
        if (clientInfo.deviceInfo && clientInfo.phone) {
          try {
            await Session.findOneAndUpdate(
              { sessionId },
              {
                $set: {
                  phone: clientInfo.phone,
                  deviceInfo: clientInfo.deviceInfo,
                  lastSeenAt: new Date(),
                },
              }
            );
            logger.debug(`Device info updated in database for ${sessionId}`);
          } catch (deviceUpdateError) {
            logger.error(
              `Failed to update device info in database for ${sessionId}:`,
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
      } catch (error) {
        logger.error('Failed to process status change in background:', error);
      }
    });
  }

  /**
   * Immediate status broadcast (like working demo)
   */
  private broadcastStatusChange(
    userId: string,
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
      await this.retryBroadcastStatus(
        userId,
        sessionId,
        broadcastPayload,
        newStatus,
        originalStatus,
        0
      );
    });
  }

  /**
   * Retry status broadcast with exponential backoff when Socket.IO is not ready
   */
  private async retryBroadcastStatus(
    userId: string,
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
              userId,
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
            userId,
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
            await EventService.recordMessageSent(userId, sessionId, message.messageId, message.to, message.type);
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
          browserArgs: [],
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
    // Run health check every 5 minutes
    this.healthCheckInterval = setInterval(
      async () => {
        await this.performHealthCheck();
      },
      5 * 60 * 1000
    );

    logger.info('Session health monitoring started');
  }

  private async performHealthCheck(): Promise<void> {
    try {
      logger.debug('Performing session health check...');

      const healthyClients: string[] = [];
      const unhealthyClients: string[] = [];
      const staleClients: string[] = [];

      for (const [sessionId, clientInfo] of this.clients.entries()) {
        try {
          // Check if client is stale (no activity for 30 minutes)
          const timeSinceActivity = Date.now() - clientInfo.lastActivity.getTime();
          const isStale = timeSinceActivity > 30 * 60 * 1000; // 30 minutes

          if (isStale) {
            staleClients.push(sessionId);
            continue;
          }

          // Check client health
          if (clientInfo.client && clientInfo.status === 'CONNECTED') {
            try {
              // Try to get connection state
              const state = await Promise.race([
                clientInfo.client.getConnectionState(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Health check timeout')), 10000)
                ),
              ]);

              if (state === 'CONNECTED' || state === 'OPENING') {
                healthyClients.push(sessionId);
              } else {
                unhealthyClients.push(sessionId);
                logger.warn(`Unhealthy session detected: ${sessionId}, state: ${state}`);
              }
            } catch (healthError) {
              unhealthyClients.push(sessionId);
              logger.warn(`Health check failed for session: ${sessionId}`, healthError);
            }
          } else if (clientInfo.status === 'ERROR' && clientInfo.errorCount > 5) {
            // Too many errors, mark for cleanup
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
}
