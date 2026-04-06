# Button Messages - Quick Reference

## Basic Example

```json
{
  "sessionId": "your-session-id",
  "to": "+1234567890",
  "type": "buttons",
  "content": "Choose an option:",
  "buttons": [
    {"id": "btn_1", "text": "Option 1"},
    {"id": "btn_2", "text": "Option 2"}
  ],
  "footer": "Optional footer"
}
```

## Constraints

| Field | Min | Max | Required |
|-------|-----|-----|----------|
| Buttons | 1 | 3 | Yes |
| Button ID | 1 char | 256 chars | Yes |
| Button Text | 1 char | 20 chars | Yes |
| Content | 1 char | 1024 chars | Yes |
| Footer | - | 60 chars | No |

## cURL Example

```bash
curl -X POST http://localhost:7811/api/v1/messages/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "to": "+1234567890",
    "type": "buttons",
    "content": "Confirm?",
    "buttons": [
      {"id": "yes", "text": "Yes"},
      {"id": "no", "text": "No"}
    ]
  }'
```

## JavaScript Example

```javascript
const axios = require('axios');

await axios.post('http://localhost:7811/api/v1/messages/send', {
  sessionId: 'session-123',
  to: '+1234567890',
  type: 'buttons',
  content: 'Choose an option:',
  buttons: [
    { id: 'opt1', text: 'Option 1' },
    { id: 'opt2', text: 'Option 2' }
  ],
  footer: 'Optional footer'
}, {
  headers: { 'X-API-Key': 'YOUR_API_KEY' }
});
```

## Socket.IO Example

```javascript
socket.emit('message:send', {
  sessionId: 'session-123',
  to: '+1234567890',
  type: 'buttons',
  content: 'Choose:',
  buttons: [
    { id: 'a', text: 'Option A' },
    { id: 'b', text: 'Option B' }
  ]
}, (response) => {
  console.log(response);
});
```

## Common Use Cases

### 1. Yes/No Confirmation
```json
{
  "content": "Confirm your appointment?",
  "buttons": [
    {"id": "confirm", "text": "Yes, Confirm"},
    {"id": "cancel", "text": "No, Cancel"}
  ]
}
```

### 2. Menu Selection
```json
{
  "content": "How can we help?",
  "buttons": [
    {"id": "support", "text": "Support"},
    {"id": "sales", "text": "Sales"},
    {"id": "info", "text": "Information"}
  ]
}
```

### 3. Rating
```json
{
  "content": "Rate your experience:",
  "buttons": [
    {"id": "excellent", "text": "⭐ Excellent"},
    {"id": "good", "text": "👍 Good"},
    {"id": "poor", "text": "👎 Poor"}
  ]
}
```

## Common Errors

### Too Many Buttons
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Maximum 3 buttons allowed"
  }
}
```

### Button Text Too Long
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{
      "path": ["buttons", 0, "text"],
      "message": "String must contain at most 20 character(s)"
    }]
  }
}
```

### Missing Content
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Content is required for button messages"
  }
}
```

## Admin UI Steps

1. Go to **Messages** page
2. Click **Send Message** button
3. Select **Buttons (Interactive)** from type dropdown
4. Enter message content
5. Click **Add Button** to add buttons (1-3)
6. Fill in button ID and text
7. Optionally add footer
8. Click **Send Message**

## Best Practices

✅ **DO**:
- Keep button text short and clear
- Use descriptive button IDs
- Test with different button counts
- Provide context in message content

❌ **DON'T**:
- Use more than 3 buttons
- Make button text longer than 20 chars
- Use special characters in button IDs
- Send buttons to unsupported WhatsApp versions

## Full Documentation

For complete documentation, see:
- [Button Messages Guide](BUTTON_MESSAGES.md)
- [API Documentation](README.md)
- [Main README](../../README.md)
