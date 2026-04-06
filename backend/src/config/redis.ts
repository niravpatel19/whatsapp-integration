import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

interface RedisConfig {
  url: string;
  password?: string;
  db: number;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
}

class RedisManager {
  private client: RedisClientType | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private isConnected = false;

  private getRedisConfig(): RedisConfig {
    const redisUrl = 'redis://:zeLtTeIlP36G@181.215.134.26:6369';
    const redisPassword = "zeLtTeIlP36G";
    const redisDb = parseInt(process.env['REDIS_DB'] || '0');
    
    logger.info('Redis configuration:', {
      url: redisUrl.replace(/:[^:@]*@/, ':***@'), // Hide password in logs
      password: redisPassword ? '***' : 'none',
      db: redisDb
    });
    
    return {
      url: redisUrl,
      password: redisPassword,
      db: redisDb,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };
  }

  public async connect(): Promise<void> {
    try {
      const config = this.getRedisConfig();

      // Main client
      this.client = createClient({
        url: config.url,
        password: config.password,
        database: config.db,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500)
        }
      });

      // Pub/Sub clients for Socket.IO
      this.pubClient = this.client.duplicate();
      this.subClient = this.client.duplicate();

      // Event handlers for main client
      this.client.on('connect', () => {
        logger.info('✅ Redis client connected');
        this.isConnected = true;
      });

      this.client.on('error', (error) => {
        logger.error('❌ Redis client error:', error);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.warn('⚠️ Redis client disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        logger.info('🔄 Redis client reconnecting...');
      });

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.pubClient.connect(),
        this.subClient.connect()
      ]);

      logger.info('✅ All Redis clients connected successfully');

    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      const disconnectPromises = [];

      if (this.client) {
        disconnectPromises.push(this.client.quit());
      }
      if (this.pubClient) {
        disconnectPromises.push(this.pubClient.quit());
      }
      if (this.subClient) {
        disconnectPromises.push(this.subClient.quit());
      }

      await Promise.all(disconnectPromises);
      
      this.client = null;
      this.pubClient = null;
      this.subClient = null;
      this.isConnected = false;

      logger.info('Redis clients disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  public getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  public getPubClient(): RedisClientType {
    if (!this.pubClient) {
      throw new Error('Redis pub client not initialized');
    }
    return this.pubClient;
  }

  public getSubClient(): RedisClientType {
    if (!this.subClient) {
      throw new Error('Redis sub client not initialized');
    }
    return this.subClient;
  }

  public isClientConnected(): boolean {
    return this.isConnected && this.client?.isOpen === true;
  }

  public async getHealth(): Promise<{ status: string; details: any }> {
    try {
      if (!this.client || !this.isConnected) {
        return {
          status: 'unhealthy',
          details: { error: 'Client not connected' }
        };
      }

      // Test Redis operation
      const testKey = 'health_check';
      const testValue = Date.now().toString();
      
      await this.client.set(testKey, testValue, { EX: 10 });
      const retrievedValue = await this.client.get(testKey);
      
      if (retrievedValue === testValue) {
        await this.client.del(testKey);
        
        return {
          status: 'healthy',
          details: {
            connected: this.isConnected,
            uptime: process.uptime(),
            memory: 'N/A' // Redis memory info not available in this client version
          }
        };
      } else {
        return {
          status: 'unhealthy',
          details: { error: 'Read/write test failed' }
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
  }

  // Utility methods
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (ttlSeconds) {
      await client.set(key, value, { EX: ttlSeconds });
    } else {
      await client.set(key, value);
    }
  }

  public async get(key: string): Promise<string | null> {
    const client = this.getClient();
    const result = await client.get(key);
    return result as string | null;
  }

  public async del(key: string): Promise<number> {
    const client = this.getClient();
    return await client.del(key);
  }

  public async exists(key: string): Promise<number> {
    const client = this.getClient();
    return await client.exists(key);
  }

  public async expire(key: string, seconds: number): Promise<boolean> {
    const client = this.getClient();
    const result = await client.expire(key, seconds);
    return Boolean(result);
  }

  public async incr(key: string): Promise<number> {
    const client = this.getClient();
    return await client.incr(key);
  }

  public async hSet(key: string, field: string, value: string): Promise<number> {
    const client = this.getClient();
    return await client.hSet(key, field, value);
  }

  public async hGet(key: string, field: string): Promise<string | undefined> {
    const client = this.getClient();
    const result = await client.hGet(key, field);
    return result as string | undefined;
  }

  public async hGetAll(key: string): Promise<Record<string, string>> {
    const client = this.getClient();
    return await client.hGetAll(key);
  }
}

// Singleton instance
const redisManager = new RedisManager();

export const connectRedis = async (): Promise<void> => {
  await redisManager.connect();
};

export const disconnectRedis = async (): Promise<void> => {
  await redisManager.disconnect();
};

export const getRedisClient = (): RedisClientType => {
  return redisManager.getClient();
};

export const getRedisPubClient = (): RedisClientType => {
  return redisManager.getPubClient();
};

export const getRedisSubClient = (): RedisClientType => {
  return redisManager.getSubClient();
};

export const isRedisConnected = (): boolean => {
  return redisManager.isClientConnected();
};

export const getRedisHealth = async (): Promise<{ status: string; details: any }> => {
  return await redisManager.getHealth();
};

// Export utility methods
export const redis = {
  set: redisManager.set.bind(redisManager),
  get: redisManager.get.bind(redisManager),
  del: redisManager.del.bind(redisManager),
  exists: redisManager.exists.bind(redisManager),
  expire: redisManager.expire.bind(redisManager),
  incr: redisManager.incr.bind(redisManager),
  hSet: redisManager.hSet.bind(redisManager),
  hGet: redisManager.hGet.bind(redisManager),
  hGetAll: redisManager.hGetAll.bind(redisManager)
};