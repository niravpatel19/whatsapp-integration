# Docker Deployment Guide

This guide covers individual Docker container deployment for production.

## 🚀 Production Configuration

**Server IP:** `82.29.198.95`
**Frontend Port:** `7810`
**Backend Port:** `7811`

**URLs:**

- Frontend: http://82.29.198.95:7810
- Backend API: http://82.29.198.95:7811
- Health Check: http://82.29.198.95:7811/health
- **API Documentation (Swagger)**: http://82.29.198.95:7811/api/docs
- **OpenAPI Specification**: http://82.29.198.95:7811/api/docs.json
- **Postman Collection**: http://82.29.198.95:7811/api/postman

## 🔧 Recent Fixes Applied

### ✅ Docker Runtime Issues Fixed (Latest Update)

- **TypeScript Path Aliases**: Resolved `Cannot find module '@/utils/logger'` error
- **Missing Dependencies**: Added `swagger-jsdoc`, `swagger-ui-express`, `js-yaml` to package.json
- **Build Process**: Updated with `tsc-alias` to properly resolve `@/*` imports
- **API Documentation**: Integrated Swagger UI and Postman collection endpoints

### 🛠️ What Was Fixed

1. **Module Resolution Error**: The error `Error: Cannot find module '@/utils/logger'` was caused by TypeScript path aliases not being resolved in the compiled JavaScript
2. **Missing Swagger Dependencies**: Added all required packages for API documentation
3. **Build Pipeline**: Enhanced build process to transform path aliases to relative imports
4. **Database Connection**: Updated Docker MongoDB/Redis URLs from `localhost` to `82.29.198.95`
5. **Mongoose Index Warnings**: Fixed duplicate schema index definitions in all models

### 🗄️ Database Configuration Required

**Before running the containers, ensure MongoDB and Redis are accessible:**

```bash
# MongoDB should be accessible at:
mongodb://82.29.198.95:27017

# Redis should be accessible at:
redis://82.29.198.95:6379
```

**Alternative: Use Docker Compose for databases:**

```bash
# Create a docker-compose.yml for databases
version: '3.8'
services:
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    environment:
      - MONGO_INITDB_DATABASE=whatsapp-integration-prod
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  mongodb_data:
  redis_data:
```

## 📦 Individual Container Deployment

### Frontend Container

**Build Command:**

```bash
cd frontend
docker build -t whatsapp-integration-frontend:latest .
```

**Run Command:**

```bash
docker run -d -p 7810:7810 \
  --name whatsapp-frontend \
  --restart unless-stopped \
  whatsapp-integration-frontend:latest
```

**Or use the build script:**

```bash
cd frontend
chmod +x build-docker.sh
./build-docker.sh
```

### Backend Container

**Build Command:**

```bash
cd backend
docker build -t whatsapp-integration-backend:latest .
```

**Run Command:**

```bash
cd backend
mkdir -p sessions logs

docker run -d -p 7811:7811 \
  --name whatsapp-backend \
  --restart unless-stopped \
  -v $(pwd)/sessions:/app/sessions \
  -v $(pwd)/logs:/app/logs \
  whatsapp-integration-backend:latest
```

**Or use the build script:**

```bash
cd backend
chmod +x build-docker.sh
./build-docker.sh
```

## 🗄️ Database Setup

You need to set up MongoDB and Redis separately:

### MongoDB

```bash
docker run -d \
  --name whatsapp-mongodb \
  --restart unless-stopped \
  -p 27017:27017 \
  -v mongodb_data:/data/db \
  -e MONGO_INITDB_DATABASE=whatsapp-integration-prod \
  mongo:5.0
```

### Redis

```bash
docker run -d \
  --name whatsapp-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:6-alpine
```

## 🔧 Environment Variables

### Frontend Environment (Built into Dockerfile)

```env
VITE_API_BASE_URL=http://82.29.198.95:7811/api/v1
VITE_SOCKET_URL=http://82.29.198.95:7811
VITE_APP_NAME=WhatsApp Integration
VITE_APP_VERSION=1.0.0
VITE_ENABLE_DEBUG=false
```

### Backend Environment (Built into Dockerfile)

```env
NODE_ENV=production
PORT=7811
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/whatsapp-integration-prod
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://82.29.198.95:7810
JWT_EXPIRES_IN=30d
WHATSAPP_MODE=real
```

## ⚠️ Important Notes

### 🔒 Security Configuration (REQUIRED)

**Before building production images, you MUST update these secrets in `backend/Dockerfile`:**

1. **JWT_SECRET:** Replace `your-super-secret-jwt-key-change-this-in-production`

   ```dockerfile
   ENV JWT_SECRET=your-actual-secure-32-character-secret
   ```

2. **JWT_REFRESH_SECRET:** Replace `your-super-secret-refresh-key-change-this-in-production`

   ```dockerfile
   ENV JWT_REFRESH_SECRET=your-actual-secure-refresh-secret
   ```

3. **SESSION_SECRET:** Replace `your-super-secret-session-key-change-this-in-production`
   ```dockerfile
   ENV SESSION_SECRET=your-actual-secure-session-secret
   ```

### 🛡️ Security Best Practices

- **Generate strong secrets:** Use at least 32 random characters
- **Never commit secrets:** Edit Dockerfile locally, don't commit secrets to git
- **Use environment-specific secrets:** Different secrets for dev/staging/production
- **Rotate secrets regularly:** Change secrets periodically for better security

### 🔧 Server Configuration

1. **Firewall Rules:** Open ports 7810 and 7811 on your server

   ```bash
   # Ubuntu/Debian
   sudo ufw allow 7810
   sudo ufw allow 7811

   # CentOS/RHEL
   sudo firewall-cmd --permanent --add-port=7810/tcp
   sudo firewall-cmd --permanent --add-port=7811/tcp
   sudo firewall-cmd --reload
   ```

2. **MongoDB & Redis:** Ensure these services are running before starting backend

   ```bash
   # Check if services are running
   docker ps | grep mongo
   docker ps | grep redis
   ```

3. **File Permissions:** Backend needs write access to sessions and logs
   ```bash
   mkdir -p backend/sessions backend/logs
   chmod 755 backend/sessions backend/logs
   ```

### 🔄 Pre-Deployment Checklist

- [ ] Updated JWT secrets in `backend/Dockerfile`
- [ ] MongoDB container running on port 27017
- [ ] Redis container running on port 6379
- [ ] Firewall ports 7810 and 7811 open
- [ ] Session and logs directories created with proper permissions
- [ ] Server has enough resources (2GB RAM minimum)
- [ ] Docker and Docker commands working properly

### 🚨 Common Pitfalls

1. **Don't forget to update secrets** - Default secrets are insecure
2. **Database connectivity** - Backend won't start without MongoDB/Redis
3. **Port conflicts** - Make sure ports 7810/7811 aren't already in use
4. **Volume mapping** - Backend needs persistent storage for sessions
5. **CORS configuration** - Frontend and backend URLs must match exactly

## 📋 Deployment Steps

1. **Setup Database Services:**

   ```bash
   # Start MongoDB
   docker run -d --name whatsapp-mongodb -p 27017:27017 mongo:5.0

   # Start Redis
   docker run -d --name whatsapp-redis -p 6379:6379 redis:6-alpine
   ```

2. **Build Backend:**

   ```bash
   cd backend
   ./build-docker.sh

   # Run backend
   docker run -d -p 7811:7811 \
     -v $(pwd)/sessions:/app/sessions \
     -v $(pwd)/logs:/app/logs \
     whatsapp-integration-backend:latest
   ```

3. **Build Frontend:**

   ```bash
   cd frontend
   ./build-docker.sh

   # Run frontend
   docker run -d -p 7810:7810 whatsapp-integration-frontend:latest
   ```

4. **Verify Deployment:**

   ```bash
   # Check all containers
   docker ps

   # Check health
   curl http://82.29.198.95:7811/health

   # Access frontend
   curl http://82.29.198.95:7810
   ```

## 🔍 Monitoring

### View Logs

```bash
# Frontend logs
docker logs -f whatsapp-frontend

# Backend logs
docker logs -f whatsapp-backend

# Database logs
docker logs -f whatsapp-mongodb
docker logs -f whatsapp-redis
```

### Container Status

```bash
# Check running containers
docker ps

# Check container stats
docker stats
```

## 🛠️ Troubleshooting

### Common Issues

1. **Port Already in Use:**

   ```bash
   # Check what's using the port
   lsof -i :7810
   lsof -i :7811

   # Stop conflicting containers
   docker stop $(docker ps -q)
   ```

2. **Container Won't Start:**

   ```bash
   # Check container logs
   docker logs whatsapp-backend
   docker logs whatsapp-frontend
   ```

3. **Database Connection Issues:**

   ```bash
   # Verify MongoDB is running
   docker exec -it whatsapp-mongodb mongosh

   # Verify Redis is running
   docker exec -it whatsapp-redis redis-cli ping
   ```

4. **File Permissions:**
   ```bash
   # Fix session directory permissions
   chmod 755 backend/sessions
   chmod 755 backend/logs
   ```

## 🔄 Updates

To update the application:

1. **Pull latest code**
2. **Rebuild images:**
   ```bash
   cd frontend && ./build-docker.sh
   cd backend && ./build-docker.sh
   ```
3. **Stop old containers:**
   ```bash
   docker stop whatsapp-frontend whatsapp-backend
   docker rm whatsapp-frontend whatsapp-backend
   ```
4. **Start new containers with updated images**

## 🔒 Security Notes

- All environment variables are embedded in Docker images
- Update JWT secrets before building production images
- Ensure firewall allows ports 7810 and 7811
- Use proper SSL certificates in production
- Regularly update base images for security patches

---

**Status:** ✅ Production Ready
**Server:** 82.29.198.95
**Ports:** Frontend: 7810, Backend: 7811
