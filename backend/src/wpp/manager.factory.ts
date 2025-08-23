import { WPPConnectManager as StubManager } from './manager.stub';
import { WPPConnectManager as RealManager } from './manager.real';
import { logger } from '../utils/logger';

// Define a common interface for both managers
export interface IWPPConnectManager {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  initializeClient(sessionId: string, config: any): Promise<void>;
  destroyClient(sessionId: string): Promise<void>;
  sendTextMessage(sessionId: string, to: string, content: string): Promise<any>;
  sendImageMessage(sessionId: string, to: string, imageUrl: string, caption?: string): Promise<any>;
  sendDocumentMessage(
    sessionId: string,
    to: string,
    documentUrl: string,
    filename?: string
  ): Promise<any>;
  sendAudioMessage(sessionId: string, to: string, audioUrl: string): Promise<any>;
  sendVideoMessage(sessionId: string, to: string, videoUrl: string, caption?: string): Promise<any>;
  sendLocationMessage(
    sessionId: string,
    to: string,
    latitude: number,
    longitude: number,
    address?: string
  ): Promise<any>;
  refreshQR(sessionId: string): Promise<void>;
  getClientInfo(sessionId: string): any;
  reconnectClient(sessionId: string): Promise<void>;
  // New methods for improved session management
  getQRData(sessionId: string): { qrData: string; expiresAt: Date; attempts: number } | null;
  isSessionReady(sessionId: string): boolean;
  getSessionStatus(sessionId: string): string | null;
}

/**
 * Factory to create the appropriate WPPConnect manager based on configuration
 */
export class WPPManagerFactory {
  static getInstance(): IWPPConnectManager {
    const useRealWhatsApp = process.env.WPP_USE_REAL_WHATSAPP === 'true';

    if (useRealWhatsApp) {
      logger.info('Using REAL WhatsApp integration (WPPConnect)');
      return RealManager.getInstance();
    } else {
      logger.info('Using STUB WhatsApp integration (for development/testing)');
      return StubManager.getInstance();
    }
  }
}

// Export the factory class and interface
export const WPPConnectManager = WPPManagerFactory;
export type WPPConnectManagerType = IWPPConnectManager;
