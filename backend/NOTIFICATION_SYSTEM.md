# 📧 WhatsApp Session Email Notification System

## Overview

This document outlines the comprehensive email notification system for WhatsApp session disconnections and reconnections. The system prevents spam by implementing intelligent suppression and provides real-time alerts when sessions break.

## 🎯 Key Features

### ✅ **Smart Status Management**

- **PENDING** - Session is initializing
- **QR** - Waiting for QR code scan
- **CONNECTED** - Session is active and working
- **DISCONNECTED** - Session lost connection (triggers email)
- **RECONNECTING** - Attempting to reconnect
- **ERROR** - Session encountered an error (triggers email)
- **EXPIRED** - Session is no longer valid

### ✅ **Anti-Spam Protection**

- **Suppression Logic**: Only one email per session per hour by default
- **Configurable Suppression**: Users can set 1-24 hours suppression
- **Status Change Debouncing**: Prevents rapid status change notifications
- **Intelligent Filtering**: Only sends emails for meaningful state changes

### ✅ **Email Types**

1. **Session Disconnected** - When a working session loses connection
2. **Session Reconnected** - When a disconnected session comes back online
3. **Session Error** - When a session encounters a critical error
4. **Session Expired** - When a session becomes permanently unusable

## 🏗️ Architecture

### **Core Components**

1. **Email Service** (`src/services/email.service.ts`)
   - SMTP configuration and email sending
   - HTML email templates
   - Connection testing and error handling

2. **Notification Service** (`src/services/notification.service.ts`)
   - Business logic for when to send notifications
   - Email content generation
   - Anti-spam protection

3. **Notification Model** (`src/models/Notification.model.ts`)
   - Database storage for notification history
   - Suppression tracking
   - Status management (PENDING, SENT, FAILED, SUPPRESSED)

4. **WPP Notification Handler** (`src/wpp/notification.handler.ts`)
   - Integrates with WPPConnect status changes
   - Triggers appropriate notifications
   - Maps WPP events to notification types

5. **Background Jobs** (`src/jobs/notification.job.ts`)
   - Processes pending notifications every 2 minutes
   - Cleans up old notifications daily
   - Tests email connection daily

## 🔧 Configuration

### **Environment Variables**

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### **User Notification Settings**

Users can configure:

- Enable/disable email notifications
- Choose which notification types to receive
- Set suppression hours (1-24 hours)

## 📊 Status Flow & Email Triggers

### **When Emails Are Sent**

```
CONNECTED → DISCONNECTED = 📧 Disconnection Email
DISCONNECTED → CONNECTED = 📧 Reconnection Email
ANY_STATUS → ERROR = 📧 Error Email
CONNECTED → EXPIRED = 📧 Session Expired Email
```

### **When Emails Are NOT Sent**

```
PENDING → QR = ❌ No email (normal flow)
QR → CONNECTED = ❌ No email (normal flow)
DISCONNECTED → DISCONNECTED = ❌ No email (duplicate)
ERROR → ERROR = ❌ No email (suppressed)
```

## 🚀 API Endpoints

### **Notification Management**

- `GET /api/v1/notifications` - Get user notifications
- `POST /api/v1/notifications/test` - Send test notification
- `GET /api/v1/notifications/settings` - Get notification settings
- `PUT /api/v1/notifications/settings` - Update notification settings
- `PATCH /api/v1/notifications/:id/mark-read` - Mark as read

### **Example: Send Test Notification**

```bash
curl -X POST http://localhost:3001/api/v1/notifications/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "type": "SESSION_DISCONNECTED"
  }'
```

### **Example: Update Notification Settings**

```bash
curl -X PUT http://localhost:3001/api/v1/notifications/settings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emailNotifications": true,
    "notificationTypes": ["SESSION_DISCONNECTED", "SESSION_ERROR"],
    "suppressionHours": 2
  }'
```

## 📧 Email Templates

### **Disconnection Email**

- **Subject**: "WhatsApp Session Disconnected - [Device Name]"
- **Content**: Session details, disconnection time, action required
- **Style**: Red header, warning styling

### **Reconnection Email**

- **Subject**: "WhatsApp Session Reconnected - [Device Name]"
- **Content**: Session details, reconnection time, success message
- **Style**: Green header, success styling

### **Error Email**

- **Subject**: "WhatsApp Session Error - [Device Name]"
- **Content**: Session details, error message, troubleshooting info
- **Style**: Red header, error styling

## 🔄 Background Processing

### **Notification Job Schedule**

- **Every 2 minutes**: Process pending notifications
- **Daily at 2 AM**: Cleanup old notifications (30+ days)
- **Daily at 1 AM**: Test email service connection

### **Automatic Cleanup**

- Notifications older than 30 days are automatically deleted
- Failed notifications are retried up to 3 times
- Suppressed notifications are cleaned up after suppression period

## 🛡️ Anti-Spam Features

### **Suppression Logic**

1. **Time-based**: No duplicate emails within suppression window
2. **Status-based**: Only meaningful status changes trigger emails
3. **User-configurable**: Users control suppression duration
4. **Type-specific**: Different suppression for different notification types

### **Debouncing**

- Status changes within 2 seconds are debounced
- Prevents rapid-fire notifications from unstable connections
- Only the final stable status triggers notifications

## 🧪 Testing

### **Test Email Configuration**

```bash
# Test SMTP connection
curl -X GET http://localhost:3001/health/email
```

### **Send Test Notifications**

```bash
# Test disconnection email
curl -X POST http://localhost:3001/api/v1/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"sessionId": "test-session", "type": "SESSION_DISCONNECTED"}'

# Test reconnection email
curl -X POST http://localhost:3001/api/v1/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"sessionId": "test-session", "type": "SESSION_RECONNECTED"}'

# Test error email
curl -X POST http://localhost:3001/api/v1/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"sessionId": "test-session", "type": "SESSION_ERROR"}'
```

## 📈 Monitoring & Logs

### **Key Log Messages**

- `Session disconnection notification sent to [email]`
- `Notification suppressed for session [id] - recent notification exists`
- `Email service connection test successful/failed`
- `Processed [N] pending notifications`

### **Health Checks**

- Email service connectivity
- Notification queue status
- Suppression effectiveness
- Delivery success rates

## 🔧 Troubleshooting

### **Common Issues**

1. **Emails Not Sending**
   - Check SMTP credentials in `.env`
   - Verify email service connection
   - Check notification settings for user

2. **Too Many Emails**
   - Increase suppression hours
   - Check for rapid status changes
   - Review notification type settings

3. **Missing Notifications**
   - Check if notifications are suppressed
   - Verify session ownership
   - Check email address validity

### **Debug Commands**

```bash
# Check notification queue
curl -X GET http://localhost:3001/api/v1/notifications?status=PENDING

# Check user settings
curl -X GET http://localhost:3001/api/v1/notifications/settings

# Force process notifications
curl -X POST http://localhost:3001/api/v1/admin/notifications/process
```

## 🎯 Best Practices

### **For Users**

1. Set reasonable suppression hours (1-2 hours recommended)
2. Choose only necessary notification types
3. Keep email address updated
4. Test notifications after setup

### **For Developers**

1. Always use non-blocking notification calls
2. Handle email service failures gracefully
3. Log notification attempts for debugging
4. Monitor suppression effectiveness

### **For System Administrators**

1. Monitor email service health daily
2. Review notification delivery rates
3. Clean up old notifications regularly
4. Test email configuration changes

## 📋 Summary

This notification system provides:

- ✅ **Reliable email alerts** for session disconnections
- ✅ **Anti-spam protection** with intelligent suppression
- ✅ **User-configurable settings** for personalization
- ✅ **Comprehensive logging** for troubleshooting
- ✅ **Background processing** for reliability
- ✅ **Professional email templates** for clarity
- ✅ **API endpoints** for management
- ✅ **Health monitoring** for system reliability

The system ensures users are promptly notified of session issues while preventing email spam through intelligent suppression and status change filtering.
