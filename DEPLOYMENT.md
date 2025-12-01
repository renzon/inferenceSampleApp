# Deployment Guide - EC2 with Docker

This guide will help you deploy the application on an EC2 Ubuntu instance using Docker and Docker Compose.

## Prerequisites

- Ubuntu EC2 instance with SSH access
- Domain name pointing to your EC2 instance's public IP
- Ports 80 and 443 open in your EC2 security group

## Step 1: Install Docker and Docker Compose on EC2

```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (to run docker without sudo)
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes to take effect, or run:
newgrp docker

# Verify installations
docker --version
docker-compose --version
```

## Step 2: Clone and Set Up the Application

```bash
# Clone your repository
git clone <your-repo-url> inference-app
cd inference-app

# Create .env file
nano .env
```

Add the following to `.env`:
```
ROBOFLOW_API_KEY=your_roboflow_api_key_here
ROBOFLOW_SERVER_URL=
NODE_ENV=production
PORT=3000
```

Save and exit (Ctrl+X, then Y, then Enter).

## Step 3: Initial Setup (HTTP Only)

Before setting up SSL, we need to start the application in HTTP mode:

```bash
# Use the HTTP-only NGINX config temporarily
cp nginx/conf.d/default-http.conf nginx/conf.d/default.conf

# Build and start containers
docker-compose up -d --build

# Check logs
docker-compose logs -f
```

Verify the application is accessible at `http://your-ec2-ip`.

## Step 4: Set Up SSL with Let's Encrypt

```bash
# Stop the containers temporarily
docker-compose down

# Update NGINX config with your domain
# Replace YOUR_DOMAIN in nginx/conf.d/default.conf with your actual domain
sed -i 's/YOUR_DOMAIN/your-domain.com/g' nginx/conf.d/default.conf

# Restore the full default.conf (with HTTPS)
# The file should already have HTTPS configuration

# Create directories for certbot
mkdir -p nginx/ssl

# Start containers again
docker-compose up -d

# Obtain SSL certificate (replace with your domain and email)
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d your-domain.com \
  -d www.your-domain.com

# After certificate is obtained, update the domain in default.conf if needed
# The certificate path should match: /etc/letsencrypt/live/your-domain.com/

# Restart NGINX to load SSL certificates
docker-compose restart nginx
```

## Step 5: Verify Deployment

1. Check container status:
   ```bash
   docker-compose ps
   ```

2. Check application logs:
   ```bash
   docker-compose logs app
   ```

3. Check NGINX logs:
   ```bash
   docker-compose logs nginx
   ```

4. Test your application:
   - Visit `https://your-domain.com` in a browser
   - Check health endpoint: `https://your-domain.com/api/health`
   - Verify SSL certificate is valid

## Step 6: Set Up Automatic Certificate Renewal

The certbot container in docker-compose.yml is already configured to automatically renew certificates every 12 hours. Verify it's running:

```bash
docker-compose ps certbot
```

## Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
docker-compose logs -f app
docker-compose logs -f nginx

# Restart a service
docker-compose restart app
docker-compose restart nginx

# Rebuild after code changes
docker-compose up -d --build

# View running containers
docker-compose ps

# Execute command in container
docker-compose exec app sh
docker-compose exec nginx sh
```

## Updating the Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build

# Check logs
docker-compose logs -f app
```

## Troubleshooting

### Application not starting
```bash
# Check application logs
docker-compose logs app

# Check if port 3000 is accessible
docker-compose exec app wget -O- http://localhost:3000/api/health
```

### NGINX not working
```bash
# Check NGINX logs
docker-compose logs nginx

# Test NGINX configuration
docker-compose exec nginx nginx -t

# Restart NGINX
docker-compose restart nginx
```

### SSL certificate issues
```bash
# Check certificate status
docker-compose exec certbot certbot certificates

# Manually renew certificate
docker-compose run --rm certbot renew

# Check certbot logs
docker-compose logs certbot
```

### Permission issues
```bash
# Ensure your user is in docker group
groups

# If not, add yourself and log out/in
sudo usermod -aG docker $USER
newgrp docker
```

## Security Notes

1. Keep your `.env` file secure and never commit it to git
2. Regularly update Docker images: `docker-compose pull`
3. Monitor logs regularly: `docker-compose logs -f`
4. Keep your system updated: `sudo apt update && sudo apt upgrade`

