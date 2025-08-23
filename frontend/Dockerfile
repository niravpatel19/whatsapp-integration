# Dockerfile for building and serving production build
FROM node:22-alpine AS build

# Set working directory
WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code and build assets
COPY . .

# Set production environment variables
ENV VITE_API_BASE_URL=http://82.29.198.95:7811/api/v1
ENV VITE_SOCKET_URL=http://82.29.198.95:7811
ENV VITE_APP_NAME="WhatsApp Integration"
ENV VITE_APP_VERSION=1.0.0
ENV VITE_APP_DESCRIPTION="WhatsApp Business Integration Platform"
ENV VITE_REQUEST_TIMEOUT=30000
ENV VITE_RETRY_ATTEMPTS=3
ENV VITE_ENABLE_ANALYTICS=false
ENV VITE_ENABLE_DEBUG=false
ENV VITE_ENABLE_DEVTOOLS=false

RUN npm run build

# Stage 2: serve static build using serve
FROM node:22-alpine

# Install serve globally
RUN npm install -g serve

# Set working directory
WORKDIR /app

# Copy build artifacts from build stage
COPY --from=build /app/dist ./dist

# Expose port 7810
EXPOSE 7810

# Serve the build on the specified port
CMD ["serve", "-s", "dist", "-l", "7810"]