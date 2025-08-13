import { WPPConnectManager as StubManager } from './manager.stub';
import { WPPConnectManager as RealManager } from './manager.real';
import { logger } from '../utils/logger';

/**
 * Factory to create the appropriate WPPConnect manager based on configuration
 */
export class WPPManagerFactory {
  static getInstance(): StubManager | RealManager {
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

// Export the factory class, not the instance
export const WPPConnectManager = WPPManagerFactory;