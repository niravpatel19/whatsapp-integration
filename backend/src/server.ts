import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { connectDatabase } from '@/config/database';
import { connectRedis } from '@/config/redis';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/error.middleware';
import { notFoundHandler } from '@/middleware/notFound.middleware';
import { requestLogger } from '@/middleware/logging.middleware';
import { rateLimiter } from '@/middleware/rateLimit.middleware';
import { setupSocketIO } from '@/socket/server';
import { WPPConnectManager } from '@/wpp/manager';

// Import routes
import authRoutes from '@/routes/auth.routes';
import sessionRoutes from '@/routes/sessions.routes';
import messageRoutes from '@/routes/messages.routes';
import webhookRoutes from '@/routes/webhooks.routes';
import eventRoutes from '@/routes/events.routes';
import healthRoutes from '@/routes/health.routes';

class Application {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;
  private wppManager: WPPConnectManager;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });
    this.wppManager = new WPPConnectManager();
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-signature', 'x-timestamp', 'Idempotency-Key']
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    this.app.use(cookieParser());

    // Logging
    this.app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
    this.app.use(requestLogger);

    // Rate limiting
    this.app.use(rateLimiter);
  }

  private initializeRoutes(): void {
    // Health check (no rate limiting)
    this.app.use('/health', healthRoutes);
    this.app.use('/ready', healthRoutes);

    // API routes
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/sessions', sessionRoutes);
    this.app.use('/api/v1/messages', messageRoutes);
    this.app.use('/api/v1/webhooks', webhookRoutes);
    this.app.use('/api/v1/events', eventRoutes);

    // API documentation
    this.app.get('/api/docs', (req, res) => {
      res.json({
        message: 'WhatsApp Integration API Documentation',
        version: '1.0.0',
        endpoints: {
          auth: '/api/v1/auth',
          sessions: '/api/v1/sessions',
          messages: '/api/v1/messages',
          webhooks: '/api/v1/webhooks',
          events: '/api/v1/events'
        },
        documentation: 'https://github.com/your-repo/whatsapp-integration/docs'
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'WhatsApp Integration API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to databases
      await connectDatabase();
      await connectRedis();

      // Initialize WPPConnect manager
      await this.wppManager.initialize();

      // Setup Socket.IO
      setupSocketIO(this.io, this.wppManager);

      // Start server
      const port = process.env.PORT || 3001;
      const host = process.env.HOST || 'localhost';

      this.server.listen(port, host, () => {
        logger.info(`🚀 Server running on http://${host}:${port}`);
        logger.info(`📚 API Documentation: http://${host}:${port}/api/docs`);
        logger.info(`🔍 Health Check: http://${host}:${port}/health`);
        logger.info(`🌐 Environment: ${process.env.NODE_ENV}`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // Close server
        this.server.close(() => {
          logger.info('HTTP server closed');
        });

        // Close Socket.IO
        this.io.close(() => {
          logger.info('Socket.IO server closed');
        });

        // Close WPPConnect clients
        await this.wppManager.shutdown();

        // Close database connections
        // MongoDB and Redis connections will be closed by their respective modules

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart
  }
}

// Start the application
const app = new Application();
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});

export default app;