import mongoose from 'mongoose';
import { logger } from '../utils/logger';

interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
}

const getDatabaseConfig = (): DatabaseConfig => {
  const uri = process.env['NODE_ENV'] === 'test' 
    ? process.env['MONGODB_TEST_URI'] || 'mongodb://localhost:27017/whatsapp-integration-test'
    : process.env['MONGODB_URI'] || 'mongodb://localhost:27017/whatsapp-integration';

  const options: mongoose.ConnectOptions = {
    minPoolSize: parseInt(process.env['DB_CONNECTION_POOL_MIN'] || '5'),
    maxPoolSize: parseInt(process.env['DB_CONNECTION_POOL_MAX'] || '20'),
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferCommands: false,
  };

  return { uri, options };
};

export const connectDatabase = async (): Promise<void> => {
  try {
    const { uri, options } = getDatabaseConfig();
    
    // Connection event handlers
    mongoose.connection.on('connected', () => {
      logger.info('✅ MongoDB connected successfully');
    });

    mongoose.connection.on('error', (error) => {
      logger.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('🔄 MongoDB reconnected');
    });

    // Connect with retry logic
    await connectWithRetry(uri, options);

  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

const connectWithRetry = async (uri: string, options: mongoose.ConnectOptions, retries = 5): Promise<void> => {
  try {
    await mongoose.connect(uri, options);
  } catch (error) {
    if (retries > 0) {
      logger.warn(`MongoDB connection failed, retrying in 5 seconds... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectWithRetry(uri, options, retries - 1);
    }
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
    throw error;
  }
};

export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

export const getDatabaseHealth = async (): Promise<{ status: string; details: any }> => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    if (state === 1) {
      // Test database operation
      await mongoose.connection.db?.admin().ping();
      
      return {
        status: 'healthy',
        details: {
          state: states[state as keyof typeof states],
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          name: mongoose.connection.name
        }
      };
    } else {
      return {
        status: 'unhealthy',
        details: {
          state: states[state as keyof typeof states]
        }
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
};