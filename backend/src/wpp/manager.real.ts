import { create, Whatsapp } from '@wppconnect-team/wppconnect';
import { logger } from '../utils/logger';
import { Session } from '../models/Session.model';
import { QREvent } from '../models/QREvent.model';
import { Event } from '../models/Event.model';
import { Message } from '../models/Message.model';
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
 * This provides actual WhatsApp connectivity using WPPConnect
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

    // Restore existing sessions after restart
    await this.restoreExistingSessions();

    this.isInitialized = true;
  }

  /**
   * Restore existing sessions after backend restart
   * This ensures sessions remain connected even after server restarts
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      logger.info('Restoring existing sessions after restart...');

      // Find all sessions that should be active (CONNECTED or QR status)
      // Also include PENDING sessions that might need restoration
      const activeSessions = await Session.find({
        status: { $in: [SessionStatus.CONNECTED, SessionStatus.QR, SessionStatus.PENDING] },
      })
        .select('sessionId userId deviceInfo status')
        .lean();
        
      // If no active sessions found, log all sessions for debugging
      if (activeSessions.length === 0) {
        const allSessions = await Session.find({})
          .select('sessionId status')
          .lean();
        logger.info(`No active sessions found. All sessions in database:`, 
          allSessions.map(s => ({ sessionId: s.sessionId, status: s.status }))
        );
      }

      logger.info(`Found ${activeSessions.length} sessions to restore`);
      
      // Log details of sessions found
      activeSessions.forEach(session => {
        logger.info(`Session to restore: ${session.sessionId} (status: ${session.status})`);
      });

      // Restore each session
      for (const session of activeSessions) {
        try {
          const sessionPath = path.join(this.sessionsPath, session.sessionId);

          // Check if session files exist
          if (fs.existsSync(sessionPath)) {
            logger.info(`Restoring session: ${session.sessionId}`);

            // Initialize the client with existing session data
            await this.initializeClient(session.sessionId, {
              session: session.sessionId,
              deviceName: session.deviceInfo?.name || 'WhatsApp Web',
              headless: true,
              devtools: false,
              useChrome: true,
              debug: false,
              logQR: false,
              browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
            });

            logger.info(`Session restored successfully: ${session.sessionId}`);
          } else {
            // Session files don't exist, mark as disconnected
            logger.warn(
              `Session files not found for ${session.sessionId}, marking as disconnected`
            );
            await Session.updateStatus(session.sessionId, SessionStatus.DISCONNECTED);
          }
        } catch (error) {
          logger.error(`Failed to restore session ${session.sessionId}:`, error);
          // Mark session as error if restoration fails
          await Session.updateStatus(
            session.sessionId,
            SessionStatus.ERROR,
            (error as Error).message
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
      // Clean up any existing session data to prevent conflicts
      await this.cleanupSessionData(sessionId);

      // Create client info
      const clientInfo: ClientInfo = {
        sessionId,
        client: null,
        status: 'INITIALIZING',
        createdAt: new Date(),
        lastActivity: new Date(),
        errorCount: 0,
        messageCount: 0,
      };

      this.clients.set(sessionId, clientInfo);

      // Create WhatsApp client using the exact working WPPConnect configuration
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
        autoClose: 0, // Disable auto-close completely (0 = disabled)
        browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
        puppeteerOptions: {
          userDataDir: path.join(this.sessionsPath, sessionId),
        },
      });

      clientInfo.client = client;

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

      logger.info(`WPP client initialized successfully: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to initialize WPP client ${sessionId}:`, error);
      await Session.updateStatus(sessionId, SessionStatus.ERROR, (error as Error).message);

      const clientInfo = this.clients.get(sessionId);
      if (clientInfo) {
        clientInfo.status = 'ERROR';
        clientInfo.errorCount++;
      }
    }
  }

  private async handleQRCode(sessionId: string, base64Qr: string, attempts: number): Promise<void> {
    logger.info(`QR Code generated for session ${sessionId}, attempt ${attempts}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo) return;

    // Update client status immediately (like working setup)
    clientInfo.status = 'QR';
    clientInfo.lastActivity = new Date();

    // Store QR data in client info for immediate access
    (clientInfo as any).qrData = base64Qr;
    (clientInfo as any).qrAttempts = attempts;
    (clientInfo as any).qrExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Debug QR code format
    logger.debug(`QR Code format for ${sessionId}:`, {
      length: base64Qr.length,
      startsWithDataUri: base64Qr.startsWith('data:image/'),
      attempts: attempts,
    });

    // IMMEDIATE broadcast like Simple Test (no await, no blocking)
    const session = await Session.findOne({ sessionId }).select('userId').lean();
    if (session) {
      const userId = session.userId.toString();

      // Immediate Socket.IO broadcast (like working setup)
      try {
        const { SocketIOService } = await import('../services/socketio.service');
        const socketService = SocketIOService.getInstance();

        // Broadcast QR immediately
        socketService.broadcastToUser(userId, 'qr:update', {
          sessionId,
          qrData: base64Qr,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          tries: attempts,
          remainingTime: 15 * 60,
          timestamp: new Date().toISOString(),
        });

        // Also broadcast status change immediately
        socketService.broadcastToUser(userId, 'session:state', {
          sessionId,
          status: 'QR',
          timestamp: new Date().toISOString(),
        });
      } catch (broadcastError) {
        logger.error('Failed to broadcast QR update:', broadcastError);
      }

      // Database operations in background (non-blocking like Simple Test)
      process.nextTick(async () => {
        try {
          await Session.updateStatus(sessionId, SessionStatus.QR);
          await QREvent.createQREvent(userId, sessionId, base64Qr, 15);
          await Event.recordEvent({
            userId,
            sessionId,
            type: EventType.QR_REFRESHED,
            payload: {
              attempts,
              expiresAt: new Date(Date.now() + 15 * 60 * 1000),
              qrLength: base64Qr.length,
            },
          });
          logger.info(`QR code stored for session: ${sessionId}`);
        } catch (error) {
          logger.error('Failed to store QR code in database:', error);
        }
      });
    }
  }

  private async handleStatusChange(sessionId: string, status: string): Promise<void> {
    logger.info(`Status change for ${sessionId}: ${status}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo) return;

    // Get session info quickly
    const session = await Session.findOne({ sessionId }).select('userId').lean();
    if (!session) return;

    const userId = session.userId.toString();
    let newStatus: SessionStatus;
    let eventPayload: any = { oldStatus: clientInfo.status, newStatus: status };

    // Map status immediately (like Simple Test)
    switch (status) {
      case 'isLogged':
      case 'CONNECTED':
        newStatus = SessionStatus.CONNECTED;
        clientInfo.status = 'CONNECTED';
        clientInfo.connectionTime = new Date();
        break;

      case 'notLogged':
      case 'DISCONNECTED':
        newStatus = SessionStatus.DISCONNECTED;
        clientInfo.status = 'DISCONNECTED';
        break;

      case 'browserClose':
      case 'serverClose':
        newStatus = SessionStatus.EXPIRED;
        clientInfo.status = 'DISCONNECTED';
        break;

      case 'qrReadError':
      case 'autocloseCalled':
      case 'desconnectedMobile':
        newStatus = SessionStatus.ERROR;
        clientInfo.status = 'ERROR';
        clientInfo.errorCount++;
        break;

      default:
        logger.info(`Unhandled status: ${status}`);
        return;
    }

    clientInfo.lastActivity = new Date();

    // IMMEDIATE broadcast like Simple Test
    try {
      const { SocketIOService } = await import('../services/socketio.service');
      const socketService = SocketIOService.getInstance();

      socketService.broadcastToUser(userId, 'session:state', {
        sessionId,
        status: newStatus,
        phone: clientInfo.phone,
        deviceInfo: clientInfo.deviceInfo,
        timestamp: new Date().toISOString(),
      });
    } catch (broadcastError) {
      logger.error('Failed to broadcast session state change:', broadcastError);
    }

    // Background database operations (non-blocking like Simple Test)
    process.nextTick(async () => {
      try {
        // Get device info for connected sessions
        if (newStatus === SessionStatus.CONNECTED && clientInfo.client) {
          try {
            const hostDevice = await clientInfo.client.getHostDevice();
            if (hostDevice && hostDevice.wid) {
              clientInfo.phone = hostDevice.wid._serialized.split('@')[0];
              clientInfo.deviceInfo = {
                name: hostDevice.pushname || 'Unknown',
                platform: 'WhatsApp Web',
                version: 'Unknown',
              };
              eventPayload = {
                ...eventPayload,
                deviceInfo: clientInfo.deviceInfo,
                phone: clientInfo.phone,
              };
            }
          } catch (err) {
            logger.warn('Failed to get device info:', err);
          }
        }

        // Update database
        await Session.updateStatus(sessionId, newStatus);
        await Event.recordEvent({
          userId,
          sessionId,
          type: EventType.SESSION_STATE,
          payload: eventPayload,
        });

        logger.debug(`Status change processed for ${sessionId}: ${status} -> ${newStatus}`);
      } catch (error) {
        logger.error('Failed to process status change in background:', error);
      }
    });
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
      await Event.recordEvent({
        userId,
        sessionId,
        type: EventType.MESSAGE_READ, // Using MESSAGE_READ for incoming messages
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

        // Record event
        await Event.recordEvent({
          userId,
          sessionId,
          type: eventType,
          payload: {
            messageId: message.messageId,
            wppMessageId: ack.id,
            ackType: ack.ack,
            to: message.to,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to handle message ACK:', error);
    }
  }

  async destroyClient(sessionId: string): Promise<void> {
    logger.info(`Destroying WPP client: ${sessionId}`);

    const clientInfo = this.clients.get(sessionId);
    if (clientInfo && clientInfo.client) {
      try {
        await clientInfo.client.close();
      } catch (error) {
        logger.error(`Error closing client ${sessionId}:`, error);
      }
      clientInfo.status = 'DISCONNECTED';
      this.clients.delete(sessionId);
    }

    // Clean up session files
    try {
      const fs = require('fs');
      const path = require('path');
      const sessionPath = path.join(process.env.WPP_SESSION_PATH || './sessions', sessionId);

      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info(`Session files deleted: ${sessionPath}`);
      }
    } catch (error) {
      logger.error(`Error deleting session files for ${sessionId}:`, error);
    }
  }

  async refreshQR(sessionId: string): Promise<void> {
    logger.info(`Refreshing QR: ${sessionId}`);

    const clientInfo = this.clients.get(sessionId);
    if (clientInfo && clientInfo.client) {
      try {
        // For WPPConnect, we need to restart the client to get a new QR
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
        logger.error(`Error refreshing QR for ${sessionId}:`, error);
      }
    }
  }

  async sendTextMessage(sessionId: string, to: string, content: string): Promise<any> {
    logger.info(`Sending text message: ${sessionId} -> ${to}`);

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

  async cleanup(): Promise<void> {
    logger.info('Cleaning up WPPConnect Manager');

    for (const [sessionId] of this.clients) {
      await this.destroyClient(sessionId);
    }

    this.clients.clear();
    this.isInitialized = false;
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
