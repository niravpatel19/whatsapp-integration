#!/bin/bash

# WhatsApp Integration Setup Script
set -e

echo "🚀 Setting up WhatsApp Integration project..."

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

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

print_success "Node.js $(node -v) is installed"

# Check if Docker is installed (optional)
if command -v docker &> /dev/null; then
    print_success "Docker is installed"
    DOCKER_AVAILABLE=true
else
    print_warning "Docker is not installed. You'll need to set up MongoDB and Redis manually."
    DOCKER_AVAILABLE=false
fi

# Create environment files if they don't exist
print_status "Setting up environment files..."

if [ ! -f .env ]; then
    cp .env.example .env
    print_success "Created .env file from template"
    print_warning "Please update .env with your actual configuration values"
else
    print_warning ".env file already exists"
fi

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    print_success "Created backend/.env file from template"
else
    print_warning "backend/.env file already exists"
fi

if [ ! -f frontend/.env ]; then
    cp frontend/.env.example frontend/.env
    print_success "Created frontend/.env file from template"
else
    print_warning "frontend/.env file already exists"
fi

# Install root dependencies
print_status "Installing root dependencies..."
npm install
print_success "Root dependencies installed"

# Install backend dependencies
print_status "Installing backend dependencies..."
cd backend
npm install
cd ..
print_success "Backend dependencies installed"

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd frontend
npm install
cd ..
print_success "Frontend dependencies installed"

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p backend/logs
mkdir -p backend/sessions
mkdir -p docker/nginx/ssl
print_success "Directories created"

# Set permissions for session directory
chmod 755 backend/sessions

print_success "Setup completed successfully!"

echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Update environment variables:"
echo "   - Edit .env with your production settings"
echo "   - Edit backend/.env with your backend configuration"
echo "   - Edit frontend/.env with your frontend configuration"
echo ""

if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "2. Start the development environment:"
    echo "   npm run docker:dev"
    echo ""
    echo "   Or start services individually:"
    echo "   npm run dev"
    echo ""
else
    echo "2. Set up MongoDB and Redis manually, then:"
    echo "   npm run dev"
    echo ""
fi

echo "3. Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend API: http://localhost:3001"
echo "   - API Documentation: http://localhost:3001/api/docs"
echo "   - Health Check: http://localhost:3001/health"
echo ""

echo "4. For production deployment:"
echo "   - Update .env with production values"
echo "   - Run: npm run docker:prod"
echo ""

print_success "Happy coding! 🎉"