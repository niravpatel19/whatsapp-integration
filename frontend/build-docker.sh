#!/bin/bash

echo "🏗️  Building Frontend Docker Image..."

# Build the Docker image
docker build -t whatsapp-integration-frontend:latest .

echo "✅ Frontend Docker image built successfully!"
echo "🚀 To run the container:"
echo "   docker run -d -p 7810:7810 whatsapp-integration-frontend:latest"
echo ""
echo "📱 Frontend will be available at: http://82.29.198.95:7810"