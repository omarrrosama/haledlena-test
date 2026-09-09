# Haled Lena Backend - Production Docker Setup

## Overview

This Docker setup includes:
- Backend application with security middleware
- Caddy (reverse proxy with automatic HTTPS & security headers)
- Portainer (container management via HTTPS)
- Persistent volumes for uploads and configs

## Prerequisites

- Docker and Docker Compose installed on your server
- Domain names (api.haledlina.com and portainer.haledlina.com) pointing to your server's IP address

## Quick Start

1. **Copy environment file and configure:**
```bash
cp .env.production.example .env
# Edit .env with your actual configuration
```

2. **Start the services:**
```bash
docker compose up -d --build
```

## Services

### Backend
- Runs on port 5000 (internal)
- Accessible via https://api.haledlina.com
- Volume `uploads_data` for persistent file storage
- Uses Helmet and rate limiting for security

### Caddy
- Handles HTTPS automatically with Let's Encrypt
- Reverse proxy to backend on https://api.haledlina.com
- Reverse proxy to Portainer on https://portainer.haledlina.com
- Adds security headers to all responses
- Ports 80 and 443 exposed

### Portainer
- Container management UI
- Accessible via https://portainer.haledlina.com (or https://your-server-ip:9443)
- Set admin password on first login
- Volume `portainer_data` for persistent config

## Useful Commands

```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: will delete data!)
docker compose down -v

# Rebuild a single service
docker compose up -d --build backend
```

## Configuration Files

- `Dockerfile`: Defines backend container image
- `docker-compose.yml`: Orchestrates all services
- `Caddyfile`: Caddy reverse proxy and security headers configuration
- `.env`: Environment variables

## Volumes

- `uploads_data`: Stores uploaded product images and files
- `caddy_data`: Caddy HTTPS certificates and data
- `caddy_config`: Caddy configuration
- `portainer_data`: Portainer settings

