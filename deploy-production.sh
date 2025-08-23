#!/bin/bash

# WhatsApp Integration - Production Deployment Script
# Server IP: 82.29.198.95
# Frontend Port: 7810
# Backend Port: 7811

echo "🚀 Starting WhatsApp Integration Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create environment files if they don't exist
print_status "Setting up environment files..."

if [ ! -f "./backend/.env.production" ]; then
    print_warning "Backend .env.production not found. Creating from example..."
    cp ./backend/env.production.example ./backend/.env.production
    print_warning "Please update ./backend/.env.production with your production secrets!"
fi

if [ ! -f "./frontend/.env.production" ]; then
    print_warning "Frontend .env.production not found. Creating from example..."
    cp ./frontend/env.production.example ./frontend/.env.production
fi

# Create necessary directories
print_status "Creating required directories..."
mkdir -p ./backend/sessions
mkdir -p ./backend/logs
chmod 755 ./backend/sessions
chmod 755 ./backend/logs

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down

# Remove old images (optional - uncomment if you want to rebuild everything)
# print_status "Removing old images..."
# docker-compose -f docker-compose.prod.yml down --rmi all

# Build and start containers
print_status "Building and starting containers..."
docker-compose -f docker-compose.prod.yml up --build -d

# Wait for services to start
print_status "Waiting for services to start..."
sleep 10

# Check service status
print_status "Checking service status..."

# Check MongoDB
if docker-compose -f docker-compose.prod.yml ps mongodb | grep -q "Up"; then
    print_success "MongoDB is running"
else
    print_error "MongoDB failed to start"
fi

# Check Redis
if docker-compose -f docker-compose.prod.yml ps redis | grep -q "Up"; then
    print_success "Redis is running"
else
    print_error "Redis failed to start"
fi

# Check Backend
if docker-compose -f docker-compose.prod.yml ps backend | grep -q "Up"; then
    print_success "Backend is running on port 7811"
else
    print_error "Backend failed to start"
fi

# Check Frontend
if docker-compose -f docker-compose.prod.yml ps frontend | grep -q "Up"; then
    print_success "Frontend is running on port 7810"
else
    print_error "Frontend failed to start"
fi

# Display access URLs
echo ""
echo "🎉 Deployment completed!"
echo ""
print_success "Frontend URL: http://82.29.198.95:7810"
print_success "Backend API:  http://82.29.198.95:7811"
print_success "Health Check: http://82.29.198.95:7811/health"
echo ""

# Display logs command
print_status "To view logs, use:"
echo "  docker-compose -f docker-compose.prod.yml logs -f [service-name]"
echo ""
print_status "Services: mongodb, redis, backend, frontend"
echo ""

# Display container status
print_status "Container Status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
print_warning "⚠️  IMPORTANT: Make sure to update the JWT secrets in ./backend/.env.production"
print_warning "⚠️  IMPORTANT: Configure your firewall to allow ports 7810 and 7811"
echo ""

print_success "✅ Production deployment script completed!" 