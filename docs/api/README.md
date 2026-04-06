# WhatsApp Integration API Documentation

This directory contains comprehensive API documentation for the WhatsApp Integration service.

## 📁 Documentation Files

- **[openapi.yaml](openapi.yaml)** - Complete OpenAPI 3.0 specification
- **[README.md](README.md)** - This documentation guide
- **[../postman/](../postman/)** - Postman collection and environments

## 🚀 Quick Start

### 1. Import Postman Collection

1. Open Postman
2. Click "Import" 
3. Select `docs/postman/WhatsApp-Integration-API.postman_collection.json`
4. Import the appropriate environment:
   - Development: `WhatsApp-Integration-Development.postman_environment.json`
   - Production: `WhatsApp-Integration-Production.postman_environment.json`

### 2. Authentication Flow

1. **Register a user** (if needed):
   ```bash
   POST /auth/register
   {
     "email": "user@example.com",
     "password": "SecurePassword123!",
     "name": "John Doe"
   }
   ```

2. **Login to get JWT token**:
   ```bash
   POST /auth/login
   {
     "email": "user@example.com", 
     "password": "SecurePassword123!"
   }
   ```

3. **Create API key** (optional, for programmatic access):
   ```bash
   POST /api-keys
   {
     "label": "My API Key"
   }
   ```

### 3. Basic Workflow

1. **Create WhatsApp session**:
   ```bash
   POST /sessions
   {
     "deviceName": "My Device"
   }
   ```

2. **Get QR code for pairing**:
   ```bash
   GET /sessions/{sessionId}/qr
   ```

3. **Send a message** (after device is paired):
   ```bash
   POST /messages/send
   {
     "sessionId": "your-session-id",
     "to": "+1234567890",
     "type": "text",
     "content": "Hello World!"
   }
   ```

## 🔐 Authentication Methods

### JWT Bearer Token
Used for user authentication in the Admin UI and personal API access.

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### API Key
Used for programmatic access and integrations.

```bash
X-API-Key: ak_1234567890abcdef1234567890abcdef1234567890abcdef
```

## 📊 API Endpoints Overview

### Authentication (`/auth`)
- `POST /auth/register` - Register new user
- `POST /auth/login` - User login
- `GET /auth/profile` - Get user profile
- `PUT /auth/profile` - Update user profile

### Sessions (`/sessions`)
- `GET /sessions` - List user sessions
- `POST /sessions` - Create new session
- `GET /sessions/{id}` - Get session details
- `DELETE /sessions/{id}` - Delete session
- `GET /sessions/{id}/qr` - Get QR code
- `POST /sessions/{id}/refresh-qr` - Refresh QR code

### Messages (`/messages`)
- `POST /messages/send` - Send message
- `GET /messages/{id}` - Get message status
- `GET /messages` - Get message history

### Webhooks (`/webhooks`)
- `GET /webhooks` - List webhooks
- `POST /webhooks` - Create webhook
- `GET /webhooks/{id}` - Get webhook details
- `PUT /webhooks/{id}` - Update webhook
- `DELETE /webhooks/{id}` - Delete webhook
- `POST /webhooks/{id}/test` - Test webhook
- `GET /webhooks/event-types` - Get available event types

### API Keys (`/api-keys`)
- `GET /api-keys` - List API keys
- `POST /api-keys` - Create API key
- `DELETE /api-keys/{id}` - Revoke API key

### Events (`/events`)
- `GET /events` - Get event history

## 📝 Message Types

### Text Message
```json
{
  "sessionId": "session-123",
  "to": "+1234567890",
  "type": "text",
  "content": "Hello World!"
}
```

### Image Message
```json
{
  "sessionId": "session-123",
  "to": "+1234567890", 
  "type": "image",
  "imageUrl": "https://example.com/image.jpg",
  "caption": "Check this out!"
}
```

### Document Message
```json
{
  "sessionId": "session-123",
  "to": "+1234567890",
  "type": "document", 
  "documentUrl": "https://example.com/document.pdf",
  "filename": "report.pdf"
}
```

### Audio Message
```json
{
  "sessionId": "session-123",
  "to": "+1234567890",
  "type": "audio",
  "audioUrl": "https://example.com/audio.mp3"
}
```

### Video Message
```json
{
  "sessionId": "session-123",
  "to": "+1234567890",
  "type": "video",
  "videoUrl": "https://example.com/video.mp4",
  "caption": "Watch this!"
}
```

### Location Message
```json
{
  "sessionId": "session-123",
  "to": "+1234567890",
  "type": "location",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "address": "San Francisco, CA"
}
```

### Button Message (Interactive)
```json
{
  "sessionId": "session-123",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Choose an option:",
  "buttons": [
    {
      "id": "btn_1",
      "text": "Option 1"
    },
    {
      "id": "btn_2",
      "text": "Option 2"
    },
    {
      "id": "btn_3",
      "text": "Option 3"
    }
  ],
  "footer": "Optional footer text"
}
```

**Button Message Constraints:**
- Minimum 1 button, maximum 3 buttons
- Button ID: max 256 characters
- Button text: max 20 characters
- Message content: max 1024 characters
- Footer: max 60 characters (optional)

## 🔔 Webhook Events

### Event Types
- `SESSION_STATE` - Session status changes
- `SESSION_DELETED` - Session deleted
- `MESSAGE_SENT` - Message sent successfully
- `MESSAGE_DELIVERED` - Message delivered
- `MESSAGE_READ` - Message read by recipient
- `QR_REFRESHED` - QR code updated
- `LOGIN` - User login
- `LOGOUT` - User logout
- `ERROR` - System errors
- `DISCONNECTED` - Session disconnected
- `RECONNECTED` - Session reconnected

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

### Signature Verification
Webhooks are signed with HMAC-SHA256. Verify signatures to ensure authenticity:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  const providedSignature = signature.replace('sha256=', '');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(providedSignature, 'hex')
  );
}
```

## 🔄 Socket.IO Real-time Events

### Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:7811', {
  auth: {
    token: 'YOUR_JWT_TOKEN'  // or API key
  }
});
```

### Events
- `qr:update` - QR code updated
- `session:state` - Session status changed  
- `message:status` - Message status updated
- `error` - Error occurred

### Example Usage
```javascript
// Listen for QR updates
socket.on('qr:update', (data) => {
  console.log('QR Code:', data.qrData);
  console.log('Expires:', data.expiresAt);
});

// Listen for session changes
socket.on('session:state', (data) => {
  console.log('Session:', data.sessionId);
  console.log('Status:', data.status);
});
```

## ⚠️ Rate Limits

| Endpoint Category | Limit | Window |
|------------------|-------|---------|
| Authentication | 10 requests | 1 minute |
| Session Management | 50 requests | 15 minutes |
| Message Sending | 100 requests | 1 hour |
| Webhook Management | 100 requests | 15 minutes |

Rate limit headers are included in responses:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp

## 🚨 Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "timestamp": "2023-12-01T12:30:00Z",
    "requestId": "req-123456789"
  }
}
```

### Common Error Codes
- `UNAUTHORIZED` - Invalid credentials or token
- `FORBIDDEN` - Access denied
- `NOT_FOUND` - Resource not found
- `RATE_LIMITED` - Too many requests
- `VALIDATION_ERROR` - Invalid input
- `SESSION_NOT_CONNECTED` - WhatsApp session not ready
- `WPP_ERROR` - WPPConnect library error
- `INTERNAL` - Server error

## 🧪 Testing with Postman

### Setup
1. Import the collection and environment
2. Set your environment variables:
   - `base_url` - API base URL
   - `test_phone_number` - Phone number for testing
   - `test_webhook_url` - Webhook URL for testing

### Test Flow
1. Run "Register User" or "Login User"
2. Run "Create API Key" (optional)
3. Run "Create Session"
4. Run "Get QR Code" and scan with WhatsApp
5. Run message sending tests
6. Set up webhooks and test delivery

### Environment Variables
The collection automatically saves important IDs:
- `jwt_token` - From login response
- `api_key` - From API key creation
- `session_id` - From session creation
- `message_id` - From message sending
- `webhook_id` - From webhook creation

## 📚 Additional Resources

- **OpenAPI Spec**: [openapi.yaml](openapi.yaml)
- **Postman Collection**: [../postman/WhatsApp-Integration-API.postman_collection.json](../postman/WhatsApp-Integration-API.postman_collection.json)
- **Main README**: [../../README.md](../../README.md)
- **Frontend Documentation**: [../../frontend/README.md](../../frontend/README.md)
- **Backend Documentation**: [../../backend/README.md](../../backend/README.md)

## 🆘 Support

If you encounter issues with the API:

1. Check the error response for specific details
2. Verify your authentication credentials
3. Ensure you're within rate limits
4. Check the session status before sending messages
5. Review the webhook signature verification

For additional support, please refer to the main project documentation or create an issue in the repository.