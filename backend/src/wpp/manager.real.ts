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
    this.isInitialized = true;
  }

  async initializeClient(sessionId: string, config: WPPConfig): Promise<void> {
    logger.info(`Initializing WPP client: ${sessionId}`, config);

    try {
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

      // Create WhatsApp client using the correct WPPConnect API
      const client = await create({
        session: sessionId,
        catchQR: (base64Qr: string, asciiQR: string, attempts: number) => {
          this.handleQRCode(sessionId, base64Qr, attempts);
        },
        statusFind: (statusSession: string, session: string) => {
          this.handleStatusChange(sessionId, statusSession);
        },
        headless: config.headless || true,
        devtools: config.devtools || false,
        useChrome: config.useChrome || true,
        debug: config.debug || false,
        logQR: config.logQR || false,
        browserArgs: config.browserArgs || [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
        puppeteerOptions: {
          userDataDir: path.join(this.sessionsPath, sessionId),
          args: config.browserArgs || [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
        createPathFileToken: true,
        waitForLogin: true,
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

    try {
      clientInfo.status = 'QR';
      clientInfo.lastActivity = new Date();

      // Update session status
      await Session.updateStatus(sessionId, SessionStatus.QR);

      // Find the session to get the userId
      const session = await Session.findOne({ sessionId });
      if (!session) {
        logger.error(`Session not found for QR generation: ${sessionId}`);
        return;
      }

      const userId = session.userId.toString();

      // Create QR event in database
      await QREvent.createQREvent(
        userId,
        sessionId,
        base64Qr,
        5 // 5 minutes expiration for real QR codes
      );

      // Record event
      await Event.recordEvent({
        userId,
        sessionId,
        type: EventType.QR_REFRESHED,
        payload: {
          attempts,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          qrLength: base64Qr.length,
        },
      });

      logger.info(`QR code stored for session: ${sessionId}`);
    } catch (error) {
      logger.error('Failed to handle QR code:', error);
      await Session.updateStatus(sessionId, SessionStatus.ERROR, (error as Error).message);
    }
  }

  private async handleStatusChange(sessionId: string, status: string): Promise<void> {
    logger.info(`Status change for ${sessionId}: ${status}`);

    const clientInfo = this.clients.get(sessionId);
    if (!clientInfo) return;

    try {
      const session = await Session.findOne({ sessionId });
      if (!session) return;

      const userId = session.userId.toString();
      let newStatus: SessionStatus;
      let eventPayload: any = { oldStatus: clientInfo.status, newStatus: status };

      switch (status) {
        case 'isLogged':
        case 'CONNECTED':
          newStatus = SessionStatus.CONNECTED;
          clientInfo.status = 'CONNECTED';
          clientInfo.connectionTime = new Date();

          // Get phone number and device info
          try {
            if (clientInfo.client) {
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
            }
          } catch (err) {
            logger.warn('Failed to get device info:', err);
          }
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

      // Update session status
      await Session.updateStatus(sessionId, newStatus);
      clientInfo.lastActivity = new Date();

      // Record event
      await Event.recordEvent({
        userId,
        sessionId,
        type: EventType.SESSION_STATE,
        payload: eventPayload,
      });
    } catch (error) {
      logger.error('Failed to handle status change:', error);
      await Session.updateStatus(sessionId, SessionStatus.ERROR, (error as Error).message);
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

  async reconnectClient(sessionId: string): Promise<void> {
    logger.info(`Reconnecting client: ${sessionId}`);

    const clientInfo = this.clients.get(sessionId);
    if (clientInfo && clientInfo.client) {
      try {
        // For reconnection, we restart the client
        await this.refreshQR(sessionId);
        clientInfo.status = 'INITIALIZING';
        clientInfo.lastActivity = new Date();
      } catch (error) {
        logger.error(`Error reconnecting ${sessionId}:`, error);
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
      const result = await clientInfo.client.sendText(to, content);
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
      const result = await clientInfo.client.sendImage(to, imageUrl, 'image', caption || '');
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
      const result = await clientInfo.client.sendFile(to, documentUrl, filename || 'document');
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
      const result = await clientInfo.client.sendPtt(to, audioUrl);
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
      const result = await clientInfo.client.sendVideoAsGif(to, videoUrl, 'video', caption || '');
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
      const result = await clientInfo.client.sendLocation(
        to,
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

  async cleanup(): Promise<void> {
    logger.info('Cleaning up WPPConnect Manager');

    for (const [sessionId] of this.clients) {
      await this.destroyClient(sessionId);
    }

    this.clients.clear();
    this.isInitialized = false;
  }
}
