# WhatsApp Integration - Production Deployment Guide

## 🚀 Production Deployment

This guide covers deploying the WhatsApp Integration service to production.

## 📋 Prerequisites

### System Requirements

- **Node.js**: v18+
- **MongoDB**: v5.0+
- **Redis**: v6.0+
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 10GB minimum for sessions and logs
- **Network**: Stable internet connection for WhatsApp API

### Security Requirements

- SSL certificates for HTTPS
- Firewall configuration
- Environment secrets management
- Regular security updates

## 🔧 Environment Setup

### 1. Backend Environment Variables

Create `/backend/.env.production`:

```bash
# Server Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database
MONGODB_URI=mongodb://localhost:27017/whatsapp-integration-prod
REDIS_URL=redis://localhost:6379

# Security - CHANGE THESE IN PRODUCTION!
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
SESSION_SECRET=your-super-secret-session-key-change-this-in-production

# JWT Expiration
JWT_EXPIRES_IN=30d
JWT_REFRESH_EXPIRES_IN=90d

# CORS
CORS_ORIGIN=https://your-frontend-domain.com

# WhatsApp
WHATSAPP_MODE=real
WHATSAPP_SESSION_PATH=./sessions

# Performance
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. Frontend Environment Variables

Create `/frontend/.env.production`:

```bash
# API Configuration
VITE_API_BASE_URL=https://your-api-domain.com/api/v1
VITE_SOCKET_URL=https://your-api-domain.com

# Application
VITE_APP_NAME=WhatsApp Integration
VITE_APP_VERSION=1.0.0

# Performance
VITE_REQUEST_TIMEOUT=30000
VITE_RETRY_ATTEMPTS=3

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=false
```

## 🏗️ Build Process

### 1. Backend Build

```bash
cd backend
npm ci --production=false
npm run build:prod
```

### 2. Frontend Build

```bash
cd frontend
npm ci --production=false
npm run build:prod
```

## 🐳 Docker Deployment (Recommended)

### 1. Backend Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY sessions/ ./sessions/

EXPOSE 3001
USER node

CMD ["npm", "start"]
```

### 2. Frontend Dockerfile

```dockerfile
FROM nginx:alpine

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 3. Docker Compose

```yaml
version: "3.8"
services:
  mongodb:
    image: mongo:5.0
    restart: unless-stopped
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: whatsapp-integration-prod

  redis:
    image: redis:6-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      - mongodb
      - redis
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/whatsapp-integration-prod
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./sessions:/app/sessions
      - ./logs:/app/logs

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend

volumes:
  mongodb_data:
  redis_data:
```

## 🔒 Security Checklist

### Pre-Deployment Security

- [ ] Change all default secrets in environment files
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Configure firewall rules (ports 80, 443, 3001)
- [ ] Set up proper CORS origins
- [ ] Enable rate limiting
- [ ] Configure secure headers
- [ ] Set up log rotation
- [ ] Enable MongoDB authentication
- [ ] Set Redis password
- [ ] Remove development tools from production

### Post-Deployment Security

- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity
- [ ] Backup database regularly
- [ ] Test disaster recovery
- [ ] Monitor performance metrics
- [ ] Audit user access
- [ ] Review API key usage

## 📊 Monitoring & Logging

### Health Checks

The application provides health check endpoints:

- **Backend**: `GET /health`
- **Database**: `GET /health/db`
- **Redis**: `GET /health/redis`

### Logging

Logs are stored in:

- **Backend**: `./logs/app.log`
- **Access**: `./logs/access.log`
- **Error**: `./logs/error.log`

Configure log rotation:

```bash
# /etc/logrotate.d/whatsapp-integration
/path/to/app/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 node node
}
```

## 🚀 Deployment Steps

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y nginx mongodb redis-server nodejs npm

# Create application user
sudo useradd -m -s /bin/bash whatsapp-app
sudo mkdir -p /opt/whatsapp-integration
sudo chown whatsapp-app:whatsapp-app /opt/whatsapp-integration
```

### 2. Application Deployment

```bash
# Switch to app user
sudo su - whatsapp-app

# Clone and setup
cd /opt/whatsapp-integration
git clone <repository> .

# Backend setup
cd backend
npm ci --production
npm run build:prod

# Frontend setup
cd ../frontend
npm ci --production
npm run build:prod

# Copy built files to nginx
sudo cp -r dist/* /var/www/html/
```

### 3. Service Configuration

Create systemd service:

```ini
# /etc/systemd/system/whatsapp-integration.service
[Unit]
Description=WhatsApp Integration Backend
After=network.target mongodb.service redis.service

[Service]
Type=simple
User=whatsapp-app
WorkingDirectory=/opt/whatsapp-integration/backend
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable whatsapp-integration
sudo systemctl start whatsapp-integration
sudo systemctl status whatsapp-integration
```

### 4. Nginx Configuration

```nginx
# /etc/nginx/sites-available/whatsapp-integration
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend
    location / {
        root /var/www/html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔄 Updates & Maintenance

### Application Updates

```bash
# Backup database
mongodump --db whatsapp-integration-prod --out /backup/$(date +%Y%m%d)

# Pull latest code
git pull origin main

# Backend update
cd backend
npm ci --production
npm run build:prod
sudo systemctl restart whatsapp-integration

# Frontend update
cd ../frontend
npm ci --production
npm run build:prod
sudo cp -r dist/* /var/www/html/
sudo systemctl reload nginx
```

### Database Maintenance

```bash
# Weekly backup
mongodump --db whatsapp-integration-prod --gzip --out /backup/weekly/$(date +%Y%m%d)

# Monthly cleanup
mongo whatsapp-integration-prod --eval "
  db.auditlogs.deleteMany({createdAt: {\$lt: new Date(Date.now() - 90*24*60*60*1000)}});
  db.events.deleteMany({createdAt: {\$lt: new Date(Date.now() - 30*24*60*60*1000)}});
"
```

## 🎯 Performance Optimization

### Database Indexing

```javascript
// MongoDB indexes
db.sessions.createIndex({ sessionId: 1 }, { unique: true });
db.sessions.createIndex({ status: 1, updatedAt: -1 });
db.messages.createIndex({ sessionId: 1, createdAt: -1 });
db.auditlogs.createIndex({ userId: 1, createdAt: -1 });
```

### Redis Configuration

```conf
# redis.conf production settings
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

## 🆘 Troubleshooting

### Common Issues

1. **Sessions not persisting**

   - Check file permissions on `./sessions` directory
   - Ensure enough disk space

2. **Socket.IO connection fails**

   - Verify nginx proxy configuration
   - Check firewall rules
   - Confirm CORS settings

3. **Database connection errors**

   - Verify MongoDB service status
   - Check connection string
   - Review network connectivity

4. **High memory usage**
   - Monitor session files
   - Check for memory leaks
   - Optimize database queries

### Logs Analysis

```bash
# Check application logs
sudo journalctl -u whatsapp-integration -f

# Monitor nginx access
sudo tail -f /var/log/nginx/access.log

# Database logs
sudo tail -f /var/log/mongodb/mongod.log

# Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

## 📞 Support

For deployment support:

- Check application logs first
- Review this documentation
- Contact system administrator
- Open support ticket with relevant logs

---

**Status**: ✅ Production Ready
**Last Updated**: [Current Date]
**Version**: 1.0.0
