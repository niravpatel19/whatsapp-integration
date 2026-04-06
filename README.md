# WhatsApp Integration API

A comprehensive, production-ready WhatsApp integration service that enables users to manage WhatsApp device sessions through WPPConnect and send messages programmatically. The system provides both an Admin UI for direct management and REST APIs for external integrations.

## 🎯 Production Status

✅ **Ready for Production Deployment**

- All console.log statements removed
- TypeScript compilation clean
- Performance optimized
- Security hardened
- Comprehensive documentation

## 🚀 Features

- **Multi-tenant WhatsApp Session Management** - Create and manage isolated WhatsApp sessions
- **Real-time QR Code Generation** - Automatic QR code generation and device pairing
- **Message Sending** - Support for text, images, documents, audio, video, location, and interactive button messages
- **Interactive Button Messages** - Send messages with up to 3 clickable buttons for user interaction
- **Webhook Notifications** - Real-time event notifications with HMAC signatures
- **Socket.IO Real-time Updates** - Live updates for QR codes, session status, and message delivery
- **Two-Factor Authentication** - TOTP-based 2FA for enhanced security
- **API Key Management** - Secure API keys for programmatic access
- **Comprehensive Audit Logging** - Complete audit trail for compliance
- **Rate Limiting** - Built-in rate limiting to prevent abuse
- **Admin UI** - React-based dashboard for easy management

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Authentication](#authentication)
- [Usage Examples](#usage-examples)
- [Webhooks](#webhooks)
- [Socket.IO Events](#socketio-events)
- [Admin UI](#admin-ui)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Production Checklist](#production-checklist)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 6+
- Redis 7+ (optional but recommended)
- Docker & Docker Compose (for containerized deployment)

### Using Docker Compose (Recommended)

1. Clone the repository:

```bash
git clone https://github.com/your-org/whatsapp-integration.git
cd whatsapp-integration
```

2. Create environment files:

```bash
# Backend environment
cp backend/.env.example backend/.env

# Frontend environment
cp frontend/.env.example frontend/.env
```

3. Start the services:

```bash
docker-compose up -d
```

4. Access the application:

- Admin UI: http://localhost:7810
- API: http://localhost:7811
- API Documentation: http://localhost:7811/api/docs

### Manual Installation

1. **Backend Setup:**

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

2. **Frontend Setup:**

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

## ⚙️ Configuration

### Backend Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=localhost

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/whatsapp-integration
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API Security
API_KEY_SALT=your-api-key-salt-here
WEBHOOK_SIGNING_SECRET=your-webhook-signing-secret

# WhatsApp Configuration
WPP_USE_REAL_WHATSAPP=false  # Set to true for production

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:7810

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### Frontend Environment Variables

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:7811/api/v1
VITE_SOCKET_URL=http://localhost:7811

# App Configuration
VITE_APP_NAME=WhatsApp Integration
VITE_APP_VERSION=1.0.0
```

## 📚 API Documentation

### Interactive Documentation

- **Swagger UI**: http://localhost:7811/api/docs
- **OpenAPI Spec**: [docs/api/openapi.yaml](docs/api/openapi.yaml)

### Base URL

```
Production: https://api.whatsapp-integration.com/api/v1
Development: http://localhost:7811/api/v1
```

### Rate Limits

| Endpoint Category  | Limit        | Window     |
| ------------------ | ------------ | ---------- |
| Authentication     | 10 requests  | 1 minute   |
| Session Management | 50 requests  | 15 minutes |
| Message Sending    | 100 requests | 1 hour     |
| Webhook Management | 100 requests | 15 minutes |

## 🔐 Authentication

The API supports two authentication methods:

### 1. JWT Bearer Token (User Authentication)

```bash
# Login to get token
curl -X POST http://localhost:7811/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'

# Use token in subsequent requests
curl -X GET http://localhost:7811/api/v1/sessions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. API Key (Programmatic Access)

```bash
# Create API key (requires JWT authentication)
curl -X POST http://localhost:7811/api/v1/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "My API Key"
  }'

# Use API key in requests
curl -X GET http://localhost:7811/api/v1/sessions \
  -H "X-API-Key: YOUR_API_KEY"
```

## 💡 Usage Examples

### Creating a WhatsApp Session

```bash
curl -X POST http://localhost:7811/api/v1/sessions \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceName": "My WhatsApp Device"
  }'
```

### Getting QR Code for Device Pairing

```bash
curl -X GET http://localhost:7811/api/v1/sessions/SESSION_ID/qr \
  -H "X-API-Key: YOUR_API_KEY"
```

### Sending a Text Message

```bash
curl -X POST http://localhost:7811/api/v1/messages/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "to": "+1234567890",
    "type": "text",
    "content": "Hello from WhatsApp Integration!"
  }'
```

### Sending an Image Message

```bash
curl -X POST http://localhost:7811/api/v1/messages/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "to": "+1234567890",
    "type": "image",
    "imageUrl": "https://example.com/image.jpg",
    "caption": "Check out this image!"
  }'
```

### Sending a Location Message

```bash
curl -X POST http://localhost:7811/api/v1/messages/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "to": "+1234567890",
    "type": "location",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "address": "San Francisco, CA, USA"
  }'
```

### Sending a Button Message (Interactive)

```bash
curl -X POST http://localhost:7811/api/v1/messages/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "to": "+1234567890",
    "type": "buttons",
    "content": "Would you like to confirm your appointment?",
    "buttons": [
      {"id": "confirm_yes", "text": "Yes, Confirm"},
      {"id": "confirm_no", "text": "No, Cancel"}
    ],
    "footer": "Reply within 24 hours"
  }'
```

For detailed button message documentation, see [docs/api/BUTTON_MESSAGES.md](docs/api/BUTTON_MESSAGES.md).

## 🔗 Webhooks

Webhooks allow you to receive real-time notifications about WhatsApp events.

### Creating a Webhook

```bash
curl -X POST http://localhost:7811/api/v1/webhooks \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhook",
    "description": "Production webhook",
    "eventTypes": [
      "SESSION_STATE",
      "MESSAGE_SENT",
      "MESSAGE_DELIVERED"
    ]
  }'
```

### Webhook Payload Format

```json
{
  "id": "evt-123456789",
  "event": "MESSAGE_SENT",
  "timestamp": "2023-12-01T12:30:00Z",
  "data": {
    "messageId": "msg-123456789",
    "sessionId": "session-123",
    "to": "+1234567890",
    "type": "text",
    "content": "Hello World",
    "status": "SENT"
  },
  "webhook": {
    "id": "webhook-123",
    "url": "https://your-domain.com/webhook"
  }
}
```

### Webhook Signature Verification

All webhook payloads are signed with HMAC-SHA256:

```javascript
const crypto = require("crypto");

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  const providedSignature = signature.replace("sha256=", "");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(providedSignature, "hex")
  );
}

// Express.js example
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  const payload = req.body.toString();

  if (!verifyWebhookSignature(payload, signature, YOUR_WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(payload);
  console.log("Received webhook:", event);

  res.status(200).send("OK");
});
```

### Available Event Types

| Event Type          | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `SESSION_STATE`     | Session status changes (connected, disconnected, etc.) |
| `SESSION_DELETED`   | WhatsApp session was deleted or removed                |
| `MESSAGE_SENT`      | Message successfully sent to WhatsApp                  |
| `MESSAGE_DELIVERED` | Message delivered to recipient                         |
| `MESSAGE_READ`      | Message read by recipient                              |
| `QR_REFRESHED`      | QR code updated for session pairing                    |
| `LOGIN`             | User login events                                      |
| `LOGOUT`            | User logout events                                     |
| `ERROR`             | System errors and failures                             |
| `DISCONNECTED`      | WhatsApp session disconnected                          |
| `RECONNECTED`       | WhatsApp session reconnected                           |

## 🔄 Socket.IO Events

Real-time updates are available via Socket.IO connection.

### Client Connection

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:7811", {
  auth: {
    token: "YOUR_JWT_TOKEN", // or use API key
  },
});

// Listen for QR code updates
socket.on("qr:update", (data) => {
  console.log("QR Code updated:", data);
  // data.qrData contains base64 image
  // data.expiresAt contains expiration time
});

// Listen for session status changes
socket.on("session:state", (data) => {
  console.log("Session status changed:", data);
  // data.sessionId, data.status, data.deviceInfo
});

// Listen for message status updates
socket.on("message:status", (data) => {
  console.log("Message status updated:", data);
  // data.messageId, data.status, data.error
});
```

### Available Socket Events

| Event            | Direction       | Description            |
| ---------------- | --------------- | ---------------------- |
| `qr:update`      | Server → Client | QR code updated        |
| `session:state`  | Server → Client | Session status changed |
| `message:status` | Server → Client | Message status updated |
| `error`          | Server → Client | Error occurred         |
| `session:create` | Client → Server | Create new session     |
| `session:delete` | Client → Server | Delete session         |
| `message:send`   | Client → Server | Send message           |

## 🖥️ Admin UI

The Admin UI provides a comprehensive dashboard for managing WhatsApp sessions, messages, and webhooks.

### Features

- **Dashboard** - Overview of sessions, messages, and system health
- **Session Management** - Create, monitor, and manage WhatsApp sessions
- **Message Tester** - Send test messages and track delivery status
- **Webhook Configuration** - Set up and manage webhook endpoints
- **API Key Management** - Generate and manage API keys
- **Event Logs** - View system events and audit trails
- **Profile Management** - User settings and 2FA configuration

### Screenshots

![Dashboard](docs/images/dashboard.png)
![Sessions](docs/images/sessions.png)
![Messages](docs/images/messages.png)
![Webhooks](docs/images/webhooks.png)

## 🛠️ Development

### Project Structure

```
whatsapp-integration/
├── backend/                 # Node.js/Express API server
│   ├── src/
│   │   ├── controllers/     # Route handlers
│   │   ├── models/         # Database models
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── wpp/           # WPPConnect integration
│   │   ├── socket/        # Socket.IO handlers
│   │   └── utils/         # Utilities
│   ├── tests/             # Test files
│   └── package.json
├── frontend/              # React/Vite UI
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   ├── stores/       # State management
│   │   └── hooks/        # Custom hooks
│   └── package.json
├── docs/                 # Documentation
│   ├── api/             # API documentation
│   └── images/          # Screenshots
├── docker-compose.yml   # Docker services
└── README.md
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run type-check

# Formatting
npm run format
```

### Database Migrations

```bash
# Run migrations
npm run migrate

# Seed database
npm run seed
```

## 🚀 Production Deployment

The application is production-ready with comprehensive optimization and security measures.

### Quick Production Setup

1. **Review the deployment checklist:**

   ```bash
   cat PRODUCTION_CHECKLIST.md
   ```

2. **Follow the detailed deployment guide:**

   ```bash
   cat DEPLOYMENT.md
   ```

3. **Build for production:**

   ```bash
   # Frontend
   cd frontend && npm run build:prod

   # Backend
   cd backend && npm run build:prod
   ```

### Docker Production Deployment

**Quick Production Setup:**

```bash
# Make deployment script executable
chmod +x deploy-production.sh

# Run automated deployment
./deploy-production.sh
```

**Manual Docker Commands:**

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
docker-compose -f docker-compose.prod.yml ps
```

**Production URLs:**

- Frontend: http://82.29.198.95:7810
- Backend API: http://82.29.198.95:7811
- Health Check: http://82.29.198.95:7811/health

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -l app=whatsapp-integration
```

### Manual Production Deployment

See the comprehensive deployment documentation:

- **[Deployment Guide](docs/deployment/DEPLOYMENT.md)** - Complete deployment instructions
- **[Production Checklist](docs/deployment/PRODUCTION_CHECKLIST.md)** - Pre-deployment checklist
- **[Deployment Index](docs/deployment/README.md)** - Documentation overview

### Environment Configuration

- **[Backend Environment](backend/env.production.example)** - Backend configuration
- **[Frontend Environment](frontend/env.production.example)** - Frontend configuration

## ✅ Production Checklist

Before deploying to production, ensure all items in [docs/deployment/PRODUCTION_CHECKLIST.md](docs/deployment/PRODUCTION_CHECKLIST.md) are completed:

### Critical Items Completed ✅

- All console.log statements removed
- TypeScript compilation without errors
- Production environment variables configured
- JWT tokens with 30-day expiration
- Database queries optimized
- Security hardening applied
- Bundle size optimized

### Infrastructure Requirements

- MongoDB 5.0+ with proper indexes
- Redis 6.0+ for caching
- SSL certificates for HTTPS
- Firewall configuration
- Backup strategy

### Quick Setup

```bash
# Copy environment files
cp backend/env.production.example backend/.env.production
cp frontend/env.production.example frontend/.env.production

# Build applications
cd frontend && npm run build:prod
cd ../backend && npm run build:prod
```

For the complete checklist, see [docs/deployment/PRODUCTION_CHECKLIST.md](docs/deployment/PRODUCTION_CHECKLIST.md).

#### Security Considerations

- [ ] Use HTTPS for all communications
- [ ] Implement proper rate limiting
- [ ] Validate all inputs
- [ ] Use secure headers (HSTS, CSP, etc.)
- [ ] Regular security updates
- [ ] Monitor for suspicious activity
- [ ] Implement proper error handling
- [ ] Use secure session management

## 📊 Monitoring and Observability

### Health Checks

```bash
# Liveness probe
curl http://localhost:7811/health

# Readiness probe
curl http://localhost:7811/ready
```

### Metrics

The application exposes Prometheus metrics at `/metrics`:

- Request duration and count
- Database connection status
- WhatsApp session health
- Message delivery rates
- Error rates and types

### Logging

Structured JSON logging with correlation IDs:

```json
{
  "timestamp": "2023-12-01T12:30:00Z",
  "level": "info",
  "message": "Message sent successfully",
  "sessionId": "session-123",
  "messageId": "msg-456",
  "to": "+1234567890",
  "requestId": "req-789"
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

### Code Style

- Use TypeScript for type safety
- Follow ESLint and Prettier configurations
- Write comprehensive tests
- Document public APIs
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Legal Notice

This software uses reverse-engineered WhatsApp Web protocols through WPPConnect. Please ensure compliance with WhatsApp's Terms of Service and obtain proper consent from end users before using this software in production.

**Important Disclaimers:**

- This is not an official WhatsApp product
- Use at your own risk
- WhatsApp may block accounts that violate their terms
- Always obtain user consent before sending messages
- Respect rate limits to avoid being blocked

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/whatsapp-integration/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/whatsapp-integration/discussions)
- **Email**: support@whatsapp-integration.com

## 🙏 Acknowledgments

- [WPPConnect](https://github.com/wppconnect-team/wppconnect) - WhatsApp Web integration
- [Socket.IO](https://socket.io/) - Real-time communication
- [Ant Design](https://ant.design/) - UI components
- [Express.js](https://expressjs.com/) - Web framework
- [MongoDB](https://www.mongodb.com/) - Database
- [Redis](https://redis.io/) - Caching and queuing

---

Made with ❤️ by the WhatsApp Integration Team
