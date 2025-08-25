# WhatsApp Integration - Backend

Backend API service for WhatsApp Integration platform built with Node.js, Express, and MongoDB.

## 🚀 Production Ready

✅ **Status**: Ready for production deployment

- All console.log statements removed
- TypeScript compilation clean
- Security hardened
- Performance optimized

## 📋 Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build:prod

# Start production server
npm run start
```

### Environment Configuration

Copy the production environment example:

```bash
cp env.production.example .env.production
```

Configure the following production variables:

- `JWT_SECRET` - Strong JWT secret key
- `JWT_REFRESH_SECRET` - Strong refresh token secret
- `MONGODB_URI` - Production MongoDB connection
- `REDIS_URL` - Production Redis connection
- `CORS_ORIGIN` - Frontend domain
- `SESSION_SECRET` - Session encryption key

## 📂 Project Structure

```
src/
├── config/          # Database and Redis configuration
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── models/          # Mongoose models
├── routes/          # API routes
├── services/        # Business logic
├── socket/          # Socket.IO configuration
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── workers/         # Background workers
└── wpp/             # WhatsApp integration
```

## 🔧 Available Scripts

| Script               | Description                                   |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Start development server with nodemon         |
| `npm run build`      | Build TypeScript to JavaScript                |
| `npm run build:prod` | Build for production with NODE_ENV=production |
| `npm run start`      | Start production server                       |
| `npm run start:dev`  | Start built server in development mode        |
| `npm test`           | Run Jest tests                                |
| `npm run lint`       | Run ESLint                                    |
| `npm run lint:fix`   | Fix ESLint issues                             |

## 🗄️ Database Models

- **User** - User accounts and authentication
- **Session** - WhatsApp session management
- **Message** - Message history and status
- **APIKey** - API key management
- **AuditLog** - Audit trail logging
- **Event** - System events
- **Webhook** - Webhook configurations

## 🔐 Authentication

The backend uses JWT tokens with the following endpoints:

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Token refresh
- `GET /api/v1/auth/me` - Get user profile
- `POST /api/v1/auth/logout` - User logout

JWT tokens expire after 30 days with refresh tokens valid for 90 days.

## 📱 WhatsApp Integration

The backend integrates with WhatsApp using WPPConnect:

- Session management with persistent storage
- QR code generation for device pairing
- Message sending (text, media, location)
- Real-time status updates via Socket.IO
- Automatic session recovery after restart

## 🔌 API Endpoints

### Sessions

- `GET /api/v1/sessions` - List sessions
- `POST /api/v1/sessions` - Create session
- `DELETE /api/v1/sessions/:id` - Delete session
- `POST /api/v1/sessions/:id/refresh-qr` - Refresh QR code

### Messages

- `POST /api/v1/messages/send` - Send message
- `GET /api/v1/messages` - Message history
- `GET /api/v1/messages/stats` - Message statistics

### Webhooks

- `GET /api/v1/webhooks` - List webhooks
- `POST /api/v1/webhooks` - Create webhook
- `PUT /api/v1/webhooks/:id` - Update webhook
- `DELETE /api/v1/webhooks/:id` - Delete webhook

## 🌐 Socket.IO Events

### Server → Client

- `qr:update` - QR code updated
- `session:state` - Session status changed
- `message:status` - Message status updated

### Client → Server

- `session:create` - Create new session
- `session:delete` - Delete session
- `message:send` - Send message

## 📊 Monitoring

### Health Checks

- `GET /health` - Application health
- `GET /health/db` - Database connectivity
- `GET /health/redis` - Redis connectivity

### Logging

Production logs are written to:

- Application logs: `./logs/app.log`
- Error logs: `./logs/error.log`
- Access logs: `./logs/access.log`

## 🚀 Deployment

For production deployment, see:

- **[Deployment Guide](./docs/deployment/DEPLOYMENT.md)** - Complete deployment instructions
- **[Production Checklist](./docs/deployment/PRODUCTION_CHECKLIST.md)** - Pre-deployment checklist
- **[Environment Example](./env.production.example)** - Production environment variables
- **[API Documentation](./docs/api/README.md)** - OpenAPI specification and documentation
- **[Postman Collection](./docs/postman/)** - Ready-to-use API testing collection

### Docker Deployment

```bash
# Build image
docker build -t whatsapp-integration-backend .

# Run container
docker run -d -p 3001:3001 \
  --env-file .env.production \
  whatsapp-integration-backend
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- MongoDB 5.0+
- Redis 6.0+

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy environment: `cp .env.example .env`
4. Start services: `npm run dev`

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --testNamePattern="Session"
```

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check MongoDB service status
   - Verify connection string
   - Ensure database permissions

2. **Redis Connection Failed**
   - Check Redis service status
   - Verify Redis URL and password
   - Check network connectivity

3. **WhatsApp Session Issues**
   - Check session file permissions
   - Verify WHATSAPP_SESSION_PATH
   - Clear sessions directory if corrupted

4. **JWT Token Issues**
   - Verify JWT secrets are set
   - Check token expiration settings
   - Ensure clock synchronization

For more troubleshooting, see the [Deployment Guide](../docs/deployment/DEPLOYMENT.md#troubleshooting).

## 📄 License

This project is licensed under the MIT License.

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Node.js**: 18+
**Database**: MongoDB 5.0+
