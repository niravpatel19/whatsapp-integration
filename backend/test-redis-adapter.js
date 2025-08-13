const { Server } = require('socket.io');
const { createServer } = require('http');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

async function testRedisAdapter() {
  console.log('🧪 Testing Socket.IO Redis Adapter...');

  try {
    // Create Redis clients
    const pubClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6369',
      socket: {
        connectTimeout: 2000,
        lazyConnect: true
      }
    });
    const subClient = pubClient.duplicate();

    // Connect Redis clients with timeout
    console.log('🔄 Attempting to connect to Redis...');
    await Promise.race([
      Promise.all([pubClient.connect(), subClient.connect()]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 3000))
    ]);
    console.log('✅ Redis clients connected');

    // Create HTTP server and Socket.IO
    const httpServer = createServer();
    const io = new Server(httpServer, {
      transports: ['websocket', 'polling']
    });

    // Create and configure Redis adapter
    const redisAdapter = createAdapter(pubClient, subClient, {
      key: 'socket.io',
      requestsTimeout: 5000,
    });

    io.adapter(redisAdapter);
    console.log('✅ Socket.IO Redis adapter configured');

    // Test room-based broadcasting
    const testRoom = 'test:room';
    const testEvent = 'test:event';
    const testData = { message: 'Hello from Redis adapter!', timestamp: new Date() };

    // Emit to room (this would work across instances)
    io.to(testRoom).emit(testEvent, testData);
    console.log('✅ Room-based broadcast test completed');

    // Get adapter info
    const adapter = io.sockets.adapter;
    console.log('📊 Adapter info:', {
      rooms: adapter.rooms.size,
      sockets: adapter.sids.size,
      type: 'redis'
    });

    // Cleanup
    io.close();
    httpServer.close();
    await pubClient.quit();
    await subClient.quit();
    
    console.log('✅ Redis adapter test completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Redis adapter test failed:', error.message);
    return false;
  }
}

// Run the test
testRedisAdapter()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });