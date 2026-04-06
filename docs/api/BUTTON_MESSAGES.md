# WhatsApp Button Messages (Interactive Messages)

This guide explains how to send interactive button messages using the WhatsApp Integration API.

## Overview

Button messages allow you to send interactive messages with up to 3 clickable buttons. Recipients can tap buttons to respond, making it ideal for:
- Quick replies and confirmations
- Menu selections
- Survey responses
- Call-to-action prompts

## Message Format

### Basic Structure

```json
{
  "sessionId": "your-session-id",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Your message text here",
  "buttons": [
    {
      "id": "unique_button_id",
      "text": "Button Label"
    }
  ],
  "footer": "Optional footer text"
}
```

### Field Descriptions

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `sessionId` | string | Yes | Your WhatsApp session ID | Must be connected |
| `to` | string | Yes | Recipient phone number | E.164 format (e.g., +1234567890) |
| `type` | string | Yes | Message type | Must be "buttons" |
| `content` | string | Yes | Main message text | Max 1024 characters |
| `buttons` | array | Yes | Array of button objects | Min 1, Max 3 buttons |
| `buttons[].id` | string | Yes | Unique button identifier | Max 256 characters |
| `buttons[].text` | string | Yes | Button display text | Max 20 characters |
| `footer` | string | No | Footer text below buttons | Max 60 characters |

## Examples

### Example 1: Simple Yes/No Confirmation

```json
{
  "sessionId": "session-abc123",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Would you like to confirm your appointment for tomorrow at 2 PM?",
  "buttons": [
    {
      "id": "confirm_yes",
      "text": "Yes, Confirm"
    },
    {
      "id": "confirm_no",
      "text": "No, Cancel"
    }
  ],
  "footer": "Reply within 24 hours"
}
```

### Example 2: Menu Selection

```json
{
  "sessionId": "session-abc123",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Welcome! How can we help you today?",
  "buttons": [
    {
      "id": "menu_support",
      "text": "Support"
    },
    {
      "id": "menu_sales",
      "text": "Sales"
    },
    {
      "id": "menu_info",
      "text": "Information"
    }
  ],
  "footer": "Customer Service Team"
}
```

### Example 3: Order Status

```json
{
  "sessionId": "session-abc123",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Your order #12345 is ready for pickup! What would you like to do?",
  "buttons": [
    {
      "id": "order_pickup",
      "text": "I'll pick it up"
    },
    {
      "id": "order_deliver",
      "text": "Deliver it"
    },
    {
      "id": "order_cancel",
      "text": "Cancel order"
    }
  ]
}
```

### Example 4: Survey Response

```json
{
  "sessionId": "session-abc123",
  "to": "+1234567890",
  "type": "buttons",
  "content": "How would you rate your experience with our service?",
  "buttons": [
    {
      "id": "rating_excellent",
      "text": "⭐ Excellent"
    },
    {
      "id": "rating_good",
      "text": "👍 Good"
    },
    {
      "id": "rating_poor",
      "text": "👎 Poor"
    }
  ],
  "footer": "Your feedback matters"
}
```

## API Endpoints

### Send Button Message via REST API

**Endpoint:** `POST /messages/send`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "sessionId": "session-abc123",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Choose an option:",
  "buttons": [
    {
      "id": "option_1",
      "text": "Option 1"
    },
    {
      "id": "option_2",
      "text": "Option 2"
    }
  ],
  "footer": "Optional footer"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg_xyz789",
      "messageId": "msg-unique-id",
      "to": "+1234567890",
      "type": "buttons",
      "status": "SENT",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Send Button Message via Socket.IO

**Event:** `message:send`

**Payload:**
```javascript
socket.emit('message:send', {
  sessionId: 'session-abc123',
  to: '+1234567890',
  type: 'buttons',
  content: 'Choose an option:',
  buttons: [
    { id: 'option_1', text: 'Option 1' },
    { id: 'option_2', text: 'Option 2' }
  ],
  footer: 'Optional footer'
}, (response) => {
  console.log('Message sent:', response);
});
```

## Code Examples

### JavaScript/Node.js (REST API)

```javascript
const axios = require('axios');

async function sendButtonMessage() {
  try {
    const response = await axios.post(
      'http://localhost:7811/messages/send',
      {
        sessionId: 'session-abc123',
        to: '+1234567890',
        type: 'buttons',
        content: 'Would you like to proceed?',
        buttons: [
          { id: 'proceed_yes', text: 'Yes' },
          { id: 'proceed_no', text: 'No' }
        ],
        footer: 'Please respond'
      },
      {
        headers: {
          'Authorization': 'Bearer YOUR_JWT_TOKEN',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Message sent:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

sendButtonMessage();
```

### Python

```python
import requests

def send_button_message():
    url = 'http://localhost:7811/messages/send'
    headers = {
        'Authorization': 'Bearer YOUR_JWT_TOKEN',
        'Content-Type': 'application/json'
    }
    payload = {
        'sessionId': 'session-abc123',
        'to': '+1234567890',
        'type': 'buttons',
        'content': 'Would you like to proceed?',
        'buttons': [
            {'id': 'proceed_yes', 'text': 'Yes'},
            {'id': 'proceed_no', 'text': 'No'}
        ],
        'footer': 'Please respond'
    }
    
    response = requests.post(url, json=payload, headers=headers)
    print('Message sent:', response.json())

send_button_message()
```

### cURL

```bash
curl -X POST http://localhost:7811/messages/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-abc123",
    "to": "+1234567890",
    "type": "buttons",
    "content": "Would you like to proceed?",
    "buttons": [
      {"id": "proceed_yes", "text": "Yes"},
      {"id": "proceed_no", "text": "No"}
    ],
    "footer": "Please respond"
  }'
```

### PHP

```php
<?php
$url = 'http://localhost:7811/messages/send';
$data = [
    'sessionId' => 'session-abc123',
    'to' => '+1234567890',
    'type' => 'buttons',
    'content' => 'Would you like to proceed?',
    'buttons' => [
        ['id' => 'proceed_yes', 'text' => 'Yes'],
        ['id' => 'proceed_no', 'text' => 'No']
    ],
    'footer' => 'Please respond'
];

$options = [
    'http' => [
        'header'  => "Content-Type: application/json\r\n" .
                     "Authorization: Bearer YOUR_JWT_TOKEN\r\n",
        'method'  => 'POST',
        'content' => json_encode($data)
    ]
];

$context  = stream_context_create($options);
$result = file_get_contents($url, false, $context);
echo $result;
?>
```

## Best Practices

### 1. Button Design
- Keep button text short and clear (max 20 characters)
- Use action-oriented language ("Confirm", "Cancel", "Learn More")
- Make button IDs descriptive for easier tracking

### 2. Message Content
- Keep the main message concise and clear
- Explain what each button does if not obvious
- Use the footer for additional context or disclaimers

### 3. Button IDs
- Use unique, descriptive IDs (e.g., "confirm_appointment", "cancel_order")
- Avoid special characters in IDs
- Keep IDs consistent across your application

### 4. User Experience
- Don't overwhelm users with too many options (max 3 buttons)
- Provide clear context for what happens when a button is clicked
- Consider the order of buttons (most important first)

### 5. Error Handling
- Always validate button data before sending
- Handle cases where the session is not connected
- Implement retry logic for failed messages

## Limitations

1. **Button Count:** Minimum 1, maximum 3 buttons per message
2. **Text Length:**
   - Button text: 20 characters max
   - Message content: 1024 characters max
   - Footer: 60 characters max
   - Button ID: 256 characters max
3. **Session Status:** Session must be in "CONNECTED" state
4. **Rate Limits:** Subject to standard API rate limits (30 messages per minute)

## Error Handling

### Common Errors

**Invalid Button Count:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "message": "At least 1 button is required"
      }
    ]
  }
}
```

**Button Text Too Long:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "path": ["buttons", 0, "text"],
        "message": "String must contain at most 20 character(s)"
      }
    ]
  }
}
```

**Session Not Connected:**
```json
{
  "error": {
    "code": "SESSION_NOT_CONNECTED",
    "message": "Session is not connected to WhatsApp"
  }
}
```

## Receiving Button Responses

When a user clicks a button, WhatsApp sends a callback with the button ID. You can receive these responses through:

1. **Webhooks:** Configure a webhook to receive button click events
2. **Message History:** Query the message history API to see responses
3. **Socket.IO Events:** Listen for incoming message events

Example webhook payload for button response:
```json
{
  "event": "MESSAGE_RECEIVED",
  "data": {
    "from": "+1234567890",
    "type": "button_response",
    "buttonId": "confirm_yes",
    "timestamp": "2024-01-15T10:35:00Z"
  }
}
```

## Testing

### Using the Admin UI

1. Navigate to the Messages page
2. Click "Send Message"
3. Select "Buttons (Interactive)" as the message type
4. Fill in the message content
5. Add 1-3 buttons with IDs and text
6. Optionally add a footer
7. Click "Send Message"

### Using Postman

Import the provided Postman collection and use the "Send Button Message" request template.

## Support

For issues or questions about button messages:
- Check the main API documentation
- Review error messages for specific validation issues
- Ensure your WhatsApp session is connected
- Verify button constraints are met

## Related Documentation

- [Main API Documentation](README.md)
- [Message Types Overview](README.md#-message-types)
- [Webhook Events](../webhooks/README.md)
- [Socket.IO Events](README.md#-socketio-real-time-events)
