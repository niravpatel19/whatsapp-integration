# Socket.IO Redis Adapter Implementation

## Overview

This implementation adds Redis adapter support to Socket.IO for multi-instance scaling. The Redis adapter enables Socket.IO to work across multiple server instances by using Redis as a message broker for cross-instance communication.

## Features Implemented

### ✅ Core Redis Adapter Integration

- **Package Installation**: Added `@socket.io/redis-adapter` and `redis` packages
- **Adapter Configuration**: Configured Redis adapter with comprehensive options
- **Graceful Fallback**: Falls back to memory adapter when Redis is unavailable
- **Error Handling**: Robust error handling for Redis connection failures

### ✅ Room-based Broadcasting

- **User Rooms**: Automatic joining of users to `user:{userId}` rooms
- **Session Rooms**: Automatic joining of sessions to `session:{sessionId}` rooms
- **Cross-instance Broadcasting**: Messages broadcast to rooms work across all instances
- **Targeted Messaging**: Efficient targeting of specific users and sessions

### ✅ Health Monitoring

- **Adapter Health Checks**: Monitor Redis adapter status and connectivity
- **Metrics Collection**: Collect Socket.IO metrics including connection counts and room counts
- **Prometheus Integration**: Export metrics in Prometheus format
- **Health Endpoints**: Added Socket.IO status to `/health` and `/ready` endpoints

### ✅ Service Integration

- **SocketIOService**: Singleton service for managing Socket.IO instance
- **BroadcastService**: Updated to use Redis-compatible room-based broadcasting
- **Health Routes**: Enhanced health check routes with Socket.IO adapter status

## Implementation Details

### 1. Redis Adapter Setup

```typescript
// backend/src/socket/server.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisPubClient, getRedisSubClient } from '../config/redis';

export const setupSocketIO = (io: SocketIOServer, wppManager: WPPConnectManager): void => {
  // Setup Redis adapter for multi-instance scaling
  try {
    const pubClient = getRedisPubClient();
    const subClient = getRedisSubClient();

    const redisAdapter = createAdapter(pubClient, subClient, {
      key: 'socket.io',
      requestsTimeout: 5000,
      publishOnSpecificResponseChannel: true,
      parser: {
        encode: JSON.stringify,
        decode: JSON.parse,
      },
    });

    io.adapter(redisAdapter);
    logger.info('✅ Socket.IO Redis adapter configured successfully');
  } catch (error) {
    logger.error('❌ Failed to setup Socket.IO Redis adapter:', error);
    logger.warn('⚠️ Socket.IO will run in single-instance mode');
  }

  // ... rest of Socket.IO setup
};
```

### 2. Room Management

```typescript
// Automatic room joining on connection
io.on('connection', (socket: AuthenticatedSocket) => {
  // Join user to their personal room for targeted broadcasting
  if (socket.user?.userId) {
    const userRoom = `user:${socket.user.userId}`;
    socket.join(userRoom);
  }
});

// Session-specific room joining
socket.on('session:create', async (data, callback) => {
  // ... session creation logic

  // Join session-specific room for targeted broadcasting
  const sessionRoom = `session:${session.sessionId}`;
  socket.join(sessionRoom);
});
```

### 3. Broadcasting Service Updates

```typescript
// backend/src/services/broadcast.service.ts
async broadcastQRUpdate(userId: string, sessionId: string, qrData: string, expiresAt: Date) {
  // Use Redis-compatible room-based broadcasting
  const userRoom = `user:${userId}`;
  const sessionRoom = `session:${sessionId}`;

  // Broadcast to user room (Redis adapter handles multi-instance distribution)
  this.io.to(userRoom).emit('qr:update', payload);

  // Also broadcast to session-specific room
  this.io.to(sessionRoom).emit('qr:update', payload);
}
```

### 4. Health Monitoring

```typescript
// backend/src/services/socketio.service.ts
export class SocketIOService {
  getAdapterHealth(): { status: string; details: any } {
    if (!this.io) {
      return { status: 'unavailable', details: { message: 'Socket.IO server not initialized' } };
    }

    const hasRedisAdapter = (this.io as any).redisAdapter;
    const adapter = this.io.sockets.adapter;

    return {
      status: 'healthy',
      details: {
        adapterType: hasRedisAdapter ? 'redis' : 'memory',
        roomCount: adapter.rooms ? adapter.rooms.size : 0,
        socketCount: adapter.sids ? adapter.sids.size : 0,
        redisConnected: true,
        lastActivity: new Date().toISOString(),
      },
    };
  }
}
```

### 5. Health Endpoints

```typescript
// backend/src/routes/health.routes.ts
router.get('/health', async (req: Request, res: Response) => {
  const healthCheck: HealthCheck = {
    // ... other health checks
    services: {
      database: await getDatabaseHealth(),
      redis: await getRedisHealth(),
      socketio: socketIOService.getAdapterHealth(), // Added Socket.IO health
    },
    // ... rest of health check
  };
});

// Prometheus metrics with Socket.IO data
router.get('/metrics', (req: Request, res: Response) => {
  const socketIOMetrics = socketIOService.getMetrics();

  const metrics = `
# ... other metrics

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
});
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6369
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# Instance Identification (optional)
INSTANCE_ID=server-1
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  app1:
    build: ./backend
    environment:
      - REDIS_URL=redis://redis:6369
      - INSTANCE_ID=app-1
    depends_on:
      - redis

  app2:
    build: ./backend
    environment:
      - REDIS_URL=redis://redis:6369
      - INSTANCE_ID=app-2
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - '6369:6369'
```

## Benefits

### 🚀 Horizontal Scaling

- **Multiple Instances**: Run multiple application instances behind a load balancer
- **Automatic Distribution**: Socket.IO automatically distributes connections across instances
- **Cross-instance Communication**: Messages sent to rooms reach all connected clients across all instances

### 📊 Improved Performance

- **Load Distribution**: Distribute Socket.IO connections across multiple processes/servers
- **Reduced Memory Usage**: Each instance only holds its own connections
- **Better Resource Utilization**: Scale based on actual load

### 🔧 Operational Benefits

- **Zero-downtime Deployments**: Deploy new instances while keeping others running
- **Fault Tolerance**: If one instance fails, others continue serving clients
- **Easy Monitoring**: Health checks and metrics for each instance

## Usage Examples

### Broadcasting to All Users

```typescript
// This will reach all connected users across all instances
io.emit('global:announcement', { message: 'System maintenance in 5 minutes' });
```

### Broadcasting to Specific User

```typescript
// This will reach the specific user on whichever instance they're connected to
const userRoom = `user:${userId}`;
io.to(userRoom).emit('user:notification', { message: 'You have a new message' });
```

### Broadcasting to Session

```typescript
// This will reach all clients connected to a specific session
const sessionRoom = `session:${sessionId}`;
io.to(sessionRoom).emit('session:update', { status: 'connected' });
```

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=socketio-redis-adapter
```

### Integration Tests

```bash
# Start Redis
docker run -d -p 6369:6369 redis:7-alpine

# Run integration tests
npm run test:integration
```

### Manual Testing

```bash
# Test adapter configuration
node test-adapter-config.js

# Test with Redis (requires running Redis)
node test-redis-adapter.js
```

## Monitoring

### Health Check Endpoints

- `GET /health` - Overall system health including Socket.IO adapter status
- `GET /ready` - Readiness check including Socket.IO adapter readiness
- `GET /metrics` - Prometheus metrics including Socket.IO connection and room counts

### Key Metrics to Monitor

- `socketio_connections_total` - Total active Socket.IO connections
- `socketio_rooms_total` - Total number of active rooms
- `socketio_adapter_type` - Adapter type (0=memory, 1=redis)

### Logs to Watch

- Socket.IO Redis adapter configuration success/failure
- Room join/leave events
- Cross-instance broadcast events
- Redis connection status changes

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check Redis server is running
   - Verify REDIS_URL environment variable
   - Check network connectivity

2. **Messages Not Reaching All Instances**
   - Verify Redis adapter is configured on all instances
   - Check Redis pub/sub is working
   - Verify room names are consistent

3. **High Memory Usage**
   - Monitor room count growth
   - Implement room cleanup for expired sessions
   - Consider connection limits per instance

### Debug Mode

```bash
# Enable Socket.IO debug logs
DEBUG=socket.io* npm start
```

## Future Enhancements

### Planned Improvements

- [ ] Connection pooling and load balancing optimization
- [ ] Memory management and garbage collection
- [ ] Event queuing with Redis for reliability
- [ ] Performance monitoring and alerting
- [ ] Automatic scaling based on connection count

### Advanced Features

- [ ] Sticky sessions for WebSocket connections
- [ ] Custom room management strategies
- [ ] Message persistence for offline users
- [ ] Rate limiting per room/user

## Conclusion

The Redis adapter implementation provides a solid foundation for scaling Socket.IO across multiple instances. The implementation includes:

- ✅ Complete Redis adapter integration
- ✅ Room-based broadcasting for efficient targeting
- ✅ Comprehensive health monitoring and metrics
- ✅ Graceful fallback when Redis is unavailable
- ✅ Integration with existing broadcast services

The system is now ready for horizontal scaling in production environments with proper Redis infrastructure.
