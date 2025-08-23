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
ENV MONGODB_URI=mongodb://localhost:27017/whatsapp-integration-prod
ENV REDIS_URL=redis://localhost:6379
ENV REDIS_PASSWORD=
ENV REDIS_DB=0
ENV JWT_SECRET=JQ50qtXWhnLwINOYc6LZFMFqT2IAx1vh
ENV JWT_REFRESH_SECRET=pxkJ4V7vAx9QY0tcG5NtmyEYWItbCpR6
ENV JWT_EXPIRES_IN=30d
ENV JWT_REFRESH_EXPIRES_IN=90d
ENV BCRYPT_ROUNDS=12
ENV SESSION_SECRET=Hd14Nj4EZYjcdORSPKxnGuiZgoKjhOsM
ENV CORS_ORIGIN=http://82.29.198.95:7810
ENV RATE_LIMIT_WINDOW_MS=900000
ENV RATE_LIMIT_MAX_REQUESTS=100
ENV WHATSAPP_MODE=real
ENV WHATSAPP_SESSION_PATH=./sessions
ENV LOG_LEVEL=info
ENV LOG_FILE=./logs/app.log
ENV MAX_REQUEST_SIZE=10mb
ENV REQUEST_TIMEOUT=30000
ENV ENABLE_SWAGGER=false
ENV ENABLE_DEBUG_LOGS=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 7811

CMD ["node", "dist/server.js"]