#!/bin/bash

# Quick Deploy Script
# This script helps you quickly deploy the application

set -e

echo "=== Inference App Quick Deploy ==="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
ROBOFLOW_API_KEY=your_roboflow_api_key_here
ROBOFLOW_SERVER_URL=
NODE_ENV=production
PORT=3000
EOF
    echo "Please edit .env and add your ROBOFLOW_API_KEY"
    echo "Then run this script again."
    exit 1
fi

# Check if ROBOFLOW_API_KEY is set
if grep -q "your_roboflow_api_key_here" .env; then
    echo "Warning: ROBOFLOW_API_KEY not configured in .env"
    echo "Please edit .env and add your API key"
    exit 1
fi

# Use HTTP config initially
echo "Setting up HTTP configuration..."
cp nginx/conf.d/default-http.conf nginx/conf.d/default.conf 2>/dev/null || true

# Build and start
echo "Building and starting containers..."
docker-compose up -d --build

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Application is running at: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_EC2_IP')"
echo ""
echo "To set up SSL with Let's Encrypt:"
echo "  1. Update nginx/conf.d/default.conf with your domain"
echo "  2. Run: ./scripts/setup-ssl.sh your-domain.com your-email@example.com"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""

