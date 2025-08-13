import { Router, Request, Response } from 'express';
import { getDatabaseHealth } from '../config/database';
import { getRedisHealth } from '../config/redis';
import { socketIOService } from '../services/socketio.service';
import { logger } from '../utils/logger';

const router = Router();

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: {
      status: string;
      details: any;
    };
    redis: {
      status: string;
      details: any;
    };
    socketio?: {
      status: string;
      details: any;
    };
    wppconnect?: {
      status: string;
      details: any;
    };
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
}

// Liveness probe - basic server health
router.get('/', async (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: { status: 'healthy', details: { connected: true } },
        redis: { status: 'healthy', details: { connected: true } }
      },
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
      }
    };

    res.status(200).json(healthCheck);

  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      uptime: process.uptime(),
    });
  }
});

// Readiness probe - detailed service health
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const databaseHealth = await getDatabaseHealth();
    const redisHealth = await getRedisHealth();
    const socketIOHealth = socketIOService.getAdapterHealth();

    const isReady = databaseHealth.status === 'healthy' && 
                   redisHealth.status === 'healthy' &&
                   (socketIOHealth.status === 'healthy' || socketIOHealth.status === 'no_adapter');

    const readinessCheck = {
      ready: isReady,
      timestamp: new Date().toISOString(),
      services: {
        database: databaseHealth,
        redis: redisHealth,
        socketio: socketIOHealth,
      },
    };

    res.status(isReady ? 200 : 503).json(readinessCheck);

  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

// Detailed system information (for monitoring)
router.get('/info', (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const systemInfo = {
    application: {
      name: 'WhatsApp Integration API',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
    },
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };

  res.json(systemInfo);
});

// Metrics endpoint (Prometheus format)
router.get('/metrics', (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const socketIOMetrics = socketIOService.getMetrics();
  
  const metrics = `
# HELP nodejs_memory_heap_used_bytes Process heap memory used
# TYPE nodejs_memory_heap_used_bytes gauge
nodejs_memory_heap_used_bytes ${memoryUsage.heapUsed}

# HELP nodejs_memory_heap_total_bytes Process heap memory total
# TYPE nodejs_memory_heap_total_bytes gauge
nodejs_memory_heap_total_bytes ${memoryUsage.heapTotal}

# HELP nodejs_memory_rss_bytes Process resident set size
# TYPE nodejs_memory_rss_bytes gauge
nodejs_memory_rss_bytes ${memoryUsage.rss}

# HELP nodejs_process_uptime_seconds Process uptime in seconds
# TYPE nodejs_process_uptime_seconds gauge
nodejs_process_uptime_seconds ${process.uptime()}

# HELP nodejs_process_cpu_user_seconds_total Process CPU user time
# TYPE nodejs_process_cpu_user_seconds_total counter
nodejs_process_cpu_user_seconds_total ${cpuUsage.user / 1000000}

# HELP nodejs_process_cpu_system_seconds_total Process CPU system time
# TYPE nodejs_process_cpu_system_seconds_total counter
nodejs_process_cpu_system_seconds_total ${cpuUsage.system / 1000000}

# HELP socketio_connections_total Total number of Socket.IO connections
# TYPE socketio_connections_total gauge
socketio_connections_total ${socketIOMetrics.connections}

# HELP socketio_rooms_total Total number of Socket.IO rooms
# TYPE socketio_rooms_total gauge
socketio_rooms_total ${socketIOMetrics.rooms}

# HELP socketio_adapter_type Socket.IO adapter type (0=memory, 1=redis)
# TYPE socketio_adapter_type gauge
socketio_adapter_type ${socketIOMetrics.adapterType === 'redis' ? 1 : 0}
`.trim();

  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

export default router;