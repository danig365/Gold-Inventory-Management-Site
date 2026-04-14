# Deployment Guide

## Commands

```bash
# Stop containers
docker compose down

# Build (or rebuild after code changes)
docker compose build --no-cache

# Start containers
docker compose up -d

# View logs
docker compose logs -f
```

## Access the Site

```
http://localhost:3001
```

On a remote server, replace `localhost` with your server's IP or domain:

```
http://<your-server-ip>:3001
```
