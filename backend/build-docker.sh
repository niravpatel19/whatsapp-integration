#!/bin/bash

echo "🏗️  Building Backend Docker Image..."

# Create necessary directories
mkdir -p sessions logs

# Build the Docker image
docker build -t whatsapp-integration-backend:latest .

echo "✅ Backend Docker image built successfully!"
echo "🚀 To run the container:"
echo "   docker run -d -p 7811:7811 \\"
echo "     -v \$(pwd)/sessions:/app/sessions \\"
echo "     -v \$(pwd)/logs:/app/logs \\"
echo "     whatsapp-integration-backend:latest"
echo ""
echo "🔧 Backend API will be available at: http://82.29.198.95:7811"
echo "❤️  Health check: http://82.29.198.95:7811/health"
echo ""
echo "⚠️  Note: Make sure MongoDB and Redis are running!"
echo "   MongoDB: mongodb://localhost:27017"
echo "   Redis: redis://localhost:6379" 