#!/bin/bash

# SSL Setup Script for Docker Compose
# Usage: ./scripts/setup-ssl.sh your-domain.com your-email@example.com

set -e

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 example.com admin@example.com"
    exit 1
fi

echo "Setting up SSL for domain: $DOMAIN"
echo "Email: $EMAIL"

# Update NGINX config with domain
sed -i.bak "s/YOUR_DOMAIN/$DOMAIN/g" nginx/conf.d/default.conf

# Ensure HTTP-only config is not active
if [ -f "nginx/conf.d/default-http.conf" ]; then
    echo "Note: Make sure default.conf is the active config (not default-http.conf)"
fi

# Start containers
echo "Starting containers..."
docker-compose up -d

# Wait for containers to be ready
echo "Waiting for containers to be ready..."
sleep 5

# Obtain SSL certificate
echo "Obtaining SSL certificate..."
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

# Restart NGINX to load SSL certificates
echo "Restarting NGINX..."
docker-compose restart nginx

echo ""
echo "SSL setup complete!"
echo "Your application should now be accessible at: https://$DOMAIN"
echo ""
echo "To verify certificate renewal is working:"
echo "  docker-compose logs certbot"

