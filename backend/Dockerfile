FROM node:22-slim

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y chromium libglib2.0-0 libnss3 libgconf-2-4 \
    libfontconfig1 libxss1 libasound2 libxtst6 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libx11-xcb1 libxcb1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=7811
ENV HOST=0.0.0.0
ENV WPP_USE_REAL_WHATSAPP=true
ENV MONGODB_URI=mongodb://root:kp5xqfWCi7et@181.215.134.26:27017/whatsapp_integration?replicaSet=rs0&readPreference=primaryPreferred&authSource=admin&directConnection=true
ENV MONGODB_TEST_URI=mongodb://root:kp5xqfWCi7et@181.215.134.26:27017/whatsapp_integration_test?replicaSet=rs0&readPreference=primaryPreferred&authSource=admin&directConnection=true
ENV REDIS_URL=redis://:zeLtTeIlP36G@181.215.134.26:6369
ENV REDIS_PASSWORD=zeLtTeIlP36G
ENV REDIS_DB=0
ENV JWT_SECRET=a7f8d9e2b4c6f1a3e5d7b9c2f4e6a8d0b3c5e7f9a1d3e5b7c9f1a3e5d7b9c2f4e6
ENV JWT_REFRESH_SECRET=b8e9f0a3c5d7e9f1a3c5d7e9f1a3c5d7e9f1a3c5d7e9f1a3c5d7e9f1a3c5d7e9f1
ENV JWT_EXPIRES_IN=30d
ENV JWT_REFRESH_EXPIRES_IN=90d
ENV API_KEY_SALT=c9f2a4e6d8b0c2e4f6a8d0b2c4e6f8a0b2c4e6f8a0b2c4e6f8a0b2c4e6f8a0b2
ENV API_KEY_ENCRYPTION_KEY=f2a5c8e1b4d7f0a3c6e9b2d5f8a1c4e7b0d3f6a9c2e5f8b1d4f7a0c3e6f9b2d5
ENV WEBHOOK_SIGNING_SECRET=d0a3c5e7f9b1d3e5f7a9c1e3f5a7c9e1f3a5c7e9f1a3c5e7f9b1d3e5f7a9c1e3
ENV RATE_LIMIT_WINDOW_MS=60000
ENV RATE_LIMIT_MAX_REQUESTS=60
ENV RATE_LIMIT_MAX_REQUESTS_PER_ENDPOINT_MESSAGES=30
ENV RATE_LIMIT_MAX_REQUESTS_PER_ENDPOINT_SESSIONS=10
ENV WPP_SESSION_PATH=./sessions
ENV WPP_MAX_CLIENTS=50
ENV WPP_HEADLESS=true
ENV WPP_DEVTOOLS=false
ENV SMTP_HOST=smtp.gmail.com
ENV SMTP_PORT=587
ENV SMTP_USER=nirav.patel@saeculumsolutions.com
ENV SMTP_PASS='lbbd ygep utfw gxuc'
ENV FRONTEND_URL=http://82.29.198.95:7810
ENV CORS_ORIGIN=http://82.29.198.95:7810
ENV LOG_LEVEL=debug
ENV LOG_FILE=logs/app.log
ENV BCRYPT_ROUNDS=12
ENV SESSION_SECRET=e1f4a6c8e0b2d4f6a8c0e2f4a6c8e0b2d4f6a8c0e2f4a6c8e0b2d4f6a8c0e2f4
ENV WEBHOOK_MAX_RETRIES=5
ENV WEBHOOK_RETRY_DELAY=1000
ENV WEBHOOK_TIMEOUT=30000
ENV MAX_FILE_SIZE=100MB
ENV ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif,application/pdf,video/mp4
ENV DB_CONNECTION_POOL_MIN=5
ENV DB_CONNECTION_POOL_MAX=20
ENV REDIS_CONNECTION_POOL_MIN=5
ENV REDIS_CONNECTION_POOL_MAX=20
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 7811

CMD ["node", "dist/server.js"]