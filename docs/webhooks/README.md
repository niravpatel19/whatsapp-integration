# Webhook Integration Guide

This guide explains how to integrate with WhatsApp Integration webhooks to receive real-time notifications about WhatsApp events.

## 📋 Table of Contents

- [Overview](#overview)
- [Setting Up Webhooks](#setting-up-webhooks)
- [Event Types](#event-types)
- [Payload Format](#payload-format)
- [Signature Verification](#signature-verification)
- [Implementation Examples](#implementation-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## 🔍 Overview

Webhooks allow your application to receive real-time notifications when events occur in the WhatsApp Integration service. Instead of polling the API for updates, webhooks push event data to your specified endpoint immediately when events happen.

### Key Features
- **Real-time notifications** - Instant event delivery
- **HMAC-SHA256 signatures** - Cryptographic verification of authenticity
- **Automatic retries** - Built-in retry mechanism with exponential backoff
- **Event filtering** - Subscribe only to events you need
- **Delivery tracking** - Monitor webhook delivery success/failure

## ⚙️ Setting Up Webhooks

### 1. Create a Webhook Endpoint

First, create an HTTPS endpoint in your application to receive webhook events:

```javascript
// Express.js example
const express = require('express');
const crypto = require('crypto');
const app = express();

// Use raw body parser for signature verification
app.use('/webhook', express.raw({type: 'application/json'}));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body.toString();
  
  // Verify signature (see signature verification section)
  if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = JSON.parse(payload);
  console.log('Received webhook:', event);
  
  // Process the event
  handleWebhookEvent(event);
  
  // Always respond with 200 OK
  res.status(200).send('OK');
});
```

### 2. Register Your Webhook

Use the API to register your webhook endpoint:

```bash
curl -X POST http://localhost:3001/api/v1/webhooks \
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

### 3. Test Your Webhook

Test your webhook to ensure it's working correctly:

```bash
curl -X POST http://localhost:3001/api/v1/webhooks/{webhookId}/test \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "test": true,
      "message": "This is a test webhook"
    }
  }'
```

## 📊 Event Types

### Available Event Types

| Event Type | Description | Payload Data |
|------------|-------------|--------------|
| `SESSION_STATE` | Session status changes (connected, disconnected, etc.) | `sessionId`, `status`, `deviceInfo`, `phone` |
| `SESSION_DELETED` | WhatsApp session was deleted or removed | `sessionId`, `reason` |
| `MESSAGE_SENT` | Message successfully sent to WhatsApp | `messageId`, `sessionId`, `to`, `type`, `content` |
| `MESSAGE_DELIVERED` | Message delivered to recipient | `messageId`, `sessionId`, `to`, `deliveredAt` |
| `MESSAGE_READ` | Message read by recipient | `messageId`, `sessionId`, `to`, `readAt` |
| `QR_REFRESHED` | QR code updated for session pairing | `sessionId`, `qrData`, `expiresAt`, `attempts` |
| `LOGIN` | User login events | `userId`, `email`, `ipAddress`, `userAgent` |
| `LOGOUT` | User logout events | `userId`, `email`, `reason` |
| `ERROR` | System errors and failures | `sessionId`, `errorCode`, `errorMessage`, `context` |
| `DISCONNECTED` | WhatsApp session disconnected | `sessionId`, `reason`, `lastSeenAt` |
| `RECONNECTED` | WhatsApp session reconnected | `sessionId`, `reconnectedAt`, `downtime` |

### Event Filtering

Subscribe only to the events you need to reduce noise and improve performance:

```json
{
  "url": "https://your-domain.com/webhook",
  "eventTypes": [
    "MESSAGE_SENT",
    "MESSAGE_DELIVERED", 
    "MESSAGE_READ"
  ]
}
```

## 📦 Payload Format

### Standard Webhook Payload

All webhook payloads follow this standard format:

```json
{
  "id": "evt-123456789",
  "event": "MESSAGE_SENT",
  "timestamp": "2023-12-01T12:30:00Z",
  "data": {
    // Event-specific data
  },
  "webhook": {
    "id": "webhook-123",
    "url": "https://your-domain.com/webhook"
  }
}
```

### Event-Specific Examples

#### SESSION_STATE Event
```json
{
  "id": "evt-123456789",
  "event": "SESSION_STATE",
  "timestamp": "2023-12-01T12:30:00Z",
  "data": {
    "sessionId": "session-123",
    "status": "CONNECTED",
    "previousStatus": "QR",
    "deviceInfo": {
      "name": "My WhatsApp Device",
      "platform": "WhatsApp Web",
      "version": "2.2.0"
    },
    "phone": "+1234567890"
  },
  "webhook": {
    "id": "webhook-123",
    "url": "https://your-domain.com/webhook"
  }
}
```

#### MESSAGE_SENT Event
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
    "content": "Hello World!",
    "status": "SENT",
    "sentAt": "2023-12-01T12:30:00Z"
  },
  "webhook": {
    "id": "webhook-123",
    "url": "https://your-domain.com/webhook"
  }
}
```

#### QR_REFRESHED Event
```json
{
  "id": "evt-123456789",
  "event": "QR_REFRESHED",
  "timestamp": "2023-12-01T12:30:00Z",
  "data": {
    "sessionId": "session-123",
    "qrData": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "expiresAt": "2023-12-01T12:45:00Z",
    "attempts": 1,
    "remainingTime": 900
  },
  "webhook": {
    "id": "webhook-123",
    "url": "https://your-domain.com/webhook"
  }
}
```

## 🔐 Signature Verification

All webhook payloads are signed with HMAC-SHA256 to ensure authenticity and prevent tampering.

### Signature Header

The signature is sent in the `X-Webhook-Signature` header:

```
X-Webhook-Signature: sha256=a1b2c3d4e5f6...
```

### Verification Implementation

#### Node.js/JavaScript
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
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

// Usage
const isValid = verifyWebhookSignature(
  req.body.toString(),
  req.headers['x-webhook-signature'],
  process.env.WEBHOOK_SECRET
);
```

#### Python
```python
import hmac
import hashlib

def verify_webhook_signature(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    provided_signature = signature.replace('sha256=', '')
    
    return hmac.compare_digest(expected_signature, provided_signature)

# Usage
is_valid = verify_webhook_signature(
    request.body,
    request.headers.get('X-Webhook-Signature'),
    os.environ['WEBHOOK_SECRET']
)
```

#### PHP
```php
function verifyWebhookSignature($payload, $signature, $secret) {
    $expectedSignature = hash_hmac('sha256', $payload, $secret);
    $providedSignature = str_replace('sha256=', '', $signature);
    
    return hash_equals($expectedSignature, $providedSignature);
}

// Usage
$isValid = verifyWebhookSignature(
    file_get_contents('php://input'),
    $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'],
    $_ENV['WEBHOOK_SECRET']
);
```

#### Go
```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "strings"
)

func verifyWebhookSignature(payload, signature, secret string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(payload))
    expectedSignature := hex.EncodeToString(mac.Sum(nil))
    
    providedSignature := strings.TrimPrefix(signature, "sha256=")
    
    return hmac.Equal([]byte(expectedSignature), []byte(providedSignature))
}
```

## 💻 Implementation Examples

### Express.js Webhook Handler

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// Webhook secret from environment
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Raw body parser for signature verification
app.use('/webhook', express.raw({type: 'application/json'}));

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

function handleWebhookEvent(event) {
  console.log(`Received ${event.event} event:`, event.data);
  
  switch (event.event) {
    case 'SESSION_STATE':
      handleSessionStateChange(event.data);
      break;
      
    case 'MESSAGE_SENT':
      handleMessageSent(event.data);
      break;
      
    case 'MESSAGE_DELIVERED':
      handleMessageDelivered(event.data);
      break;
      
    case 'QR_REFRESHED':
      handleQRRefreshed(event.data);
      break;
      
    default:
      console.log('Unhandled event type:', event.event);
  }
}

function handleSessionStateChange(data) {
  console.log(`Session ${data.sessionId} changed from ${data.previousStatus} to ${data.status}`);
  
  if (data.status === 'CONNECTED') {
    console.log(`Device connected: ${data.deviceInfo.name} (${data.phone})`);
    // Notify your application that the session is ready
  } else if (data.status === 'DISCONNECTED') {
    console.log(`Session ${data.sessionId} disconnected`);
    // Handle disconnection
  }
}

function handleMessageSent(data) {
  console.log(`Message ${data.messageId} sent to ${data.to}`);
  // Update your database with message status
}

function handleMessageDelivered(data) {
  console.log(`Message ${data.messageId} delivered to ${data.to}`);
  // Update delivery status in your system
}

function handleQRRefreshed(data) {
  console.log(`QR code refreshed for session ${data.sessionId}`);
  // Update QR code in your UI if needed
}

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body.toString();
  
  // Verify signature
  if (!verifySignature(payload, signature, WEBHOOK_SECRET)) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }
  
  try {
    const event = JSON.parse(payload);
    handleWebhookEvent(event);
    
    // Always respond with 200 OK
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(400).send('Bad Request');
  }
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### Next.js API Route

```javascript
// pages/api/webhook.js
import crypto from 'crypto';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  
  // Process the event
  console.log('Received webhook:', event);
  
  // Your event handling logic here
  
  res.status(200).json({ received: true });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}
```

### Flask Webhook Handler

```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import json
import os

app = Flask(__name__)

WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET')

def verify_signature(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    provided_signature = signature.replace('sha256=', '')
    
    return hmac.compare_digest(expected_signature, provided_signature)

def handle_webhook_event(event):
    print(f"Received {event['event']} event:", event['data'])
    
    if event['event'] == 'SESSION_STATE':
        handle_session_state_change(event['data'])
    elif event['event'] == 'MESSAGE_SENT':
        handle_message_sent(event['data'])
    elif event['event'] == 'MESSAGE_DELIVERED':
        handle_message_delivered(event['data'])
    # Add more event handlers as needed

def handle_session_state_change(data):
    print(f"Session {data['sessionId']} changed to {data['status']}")
    # Your logic here

def handle_message_sent(data):
    print(f"Message {data['messageId']} sent to {data['to']}")
    # Your logic here

def handle_message_delivered(data):
    print(f"Message {data['messageId']} delivered to {data['to']}")
    # Your logic here

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature')
    payload = request.get_data(as_text=True)
    
    if not verify_signature(payload, signature, WEBHOOK_SECRET):
        return jsonify({'error': 'Invalid signature'}), 401
    
    try:
        event = json.loads(payload)
        handle_webhook_event(event)
        return jsonify({'received': True}), 200
    except Exception as e:
        print(f"Error processing webhook: {e}")
        return jsonify({'error': 'Bad Request'}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)
```

## ✅ Best Practices

### 1. Always Verify Signatures
Never process webhook events without verifying the HMAC signature:

```javascript
if (!verifySignature(payload, signature, secret)) {
  return res.status(401).send('Invalid signature');
}
```

### 2. Respond Quickly
Webhook endpoints should respond within 30 seconds. For long-running tasks, queue the work:

```javascript
app.post('/webhook', async (req, res) => {
  // Verify signature first
  if (!verifySignature(payload, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Queue the work for background processing
  await jobQueue.add('process-webhook', event);
  
  // Respond immediately
  res.status(200).send('OK');
});
```

### 3. Handle Idempotency
Webhooks may be delivered multiple times. Use the event ID to ensure idempotent processing:

```javascript
const processedEvents = new Set();

function handleWebhookEvent(event) {
  if (processedEvents.has(event.id)) {
    console.log('Event already processed:', event.id);
    return;
  }
  
  // Process the event
  processEvent(event);
  
  // Mark as processed
  processedEvents.add(event.id);
}
```

### 4. Implement Proper Error Handling
Handle errors gracefully and return appropriate HTTP status codes:

```javascript
app.post('/webhook', (req, res) => {
  try {
    // Process webhook
    handleWebhookEvent(event);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Return 500 to trigger retry
    res.status(500).send('Internal Server Error');
  }
});
```

### 5. Use HTTPS
Always use HTTPS for webhook endpoints to ensure secure transmission:

```javascript
// Good
"url": "https://your-domain.com/webhook"

// Bad
"url": "http://your-domain.com/webhook"
```

### 6. Monitor Webhook Health
Regularly check webhook delivery status and fix issues promptly:

```bash
# Get webhook delivery logs
curl -X GET http://localhost:3001/api/v1/webhooks/{webhookId}/logs \
  -H "X-API-Key: YOUR_API_KEY"
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Signature Verification Fails
- **Cause**: Incorrect secret or payload modification
- **Solution**: Ensure you're using the raw request body and correct secret

```javascript
// Correct - use raw body
app.use('/webhook', express.raw({type: 'application/json'}));

// Incorrect - parsed body will fail verification
app.use(express.json());
```

#### 2. Webhook Not Receiving Events
- **Cause**: URL not reachable or incorrect event types
- **Solution**: Test webhook connectivity and verify event subscriptions

```bash
# Test webhook
curl -X POST http://localhost:3001/api/v1/webhooks/{webhookId}/test \
  -H "X-API-Key: YOUR_API_KEY"
```

#### 3. Timeout Errors
- **Cause**: Webhook endpoint taking too long to respond
- **Solution**: Optimize processing or use background jobs

```javascript
// Use background processing for heavy tasks
app.post('/webhook', async (req, res) => {
  // Respond immediately
  res.status(200).send('OK');
  
  // Process in background
  setImmediate(() => {
    processWebhookEvent(event);
  });
});
```

#### 4. Duplicate Events
- **Cause**: Webhook retries or network issues
- **Solution**: Implement idempotency using event IDs

```javascript
const redis = require('redis');
const client = redis.createClient();

async function isEventProcessed(eventId) {
  return await client.exists(`webhook:${eventId}`);
}

async function markEventProcessed(eventId) {
  await client.setex(`webhook:${eventId}`, 3600, 'processed'); // 1 hour TTL
}
```

### Debugging Tips

1. **Log all webhook requests** for debugging:
```javascript
app.post('/webhook', (req, res) => {
  console.log('Webhook received:', {
    headers: req.headers,
    body: req.body.toString()
  });
  
  // Process webhook...
});
```

2. **Use webhook testing tools**:
   - [webhook.site](https://webhook.site) - Inspect webhook payloads
   - [ngrok](https://ngrok.com) - Expose local endpoints for testing

3. **Monitor webhook delivery logs**:
```bash
# Get recent delivery attempts
curl -X GET "http://localhost:3001/api/v1/webhooks/{webhookId}/logs?limit=10" \
  -H "X-API-Key: YOUR_API_KEY"
```

4. **Test webhook manually**:
```bash
# Send test payload
curl -X POST http://localhost:3001/api/v1/webhooks/{webhookId}/test \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payload": {"test": true}}'
```

## 📚 Additional Resources

- **API Documentation**: [../api/README.md](../api/README.md)
- **OpenAPI Specification**: [../api/openapi.yaml](../api/openapi.yaml)
- **Postman Collection**: [../postman/WhatsApp-Integration-API.postman_collection.json](../postman/WhatsApp-Integration-API.postman_collection.json)
- **Main Documentation**: [../../README.md](../../README.md)

## 🆘 Support

For webhook-related issues:

1. Check webhook delivery logs in the admin UI
2. Verify your endpoint is accessible via HTTPS
3. Ensure signature verification is implemented correctly
4. Monitor for timeout or error responses
5. Test with the webhook test endpoint

For additional support, please refer to the main project documentation or create an issue in the repository.