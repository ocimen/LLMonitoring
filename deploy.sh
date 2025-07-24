#!/bin/bash

# Simple deployment script for VPS
set -e

echo "🚀 Starting deployment..."

# Pull latest code
git pull origin main

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your production values!"
    exit 1
fi

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check health
echo "🔍 Checking service health..."
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    exit 1
fi

echo "🎉 Deployment completed successfully!"
echo "📊 Frontend: http://your-domain.com"
echo "🔧 Backend: http://your-domain.com/api"