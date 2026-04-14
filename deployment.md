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

## Database Migrations

This project runs schema initialization/migration automatically when the app container starts.
No separate migration command is required.

If you already have old data volume, just rebuild and restart:

```bash
docker compose build --no-cache
docker compose up -d
```

## Default Admin Login

Unless overridden by environment variables, first-time startup creates:

- Username: `admin`
- Password: `admin`

## Current Users Credentials

These credentials are currently available on this running setup:

- Admin user
- Username: `admin`
- Password: `admin`

- Standard user (created via API)
- Username: `shopuser`
- Password: `shop1234`

For production, change these passwords immediately.

## User Management API Usage

Base URL:

```text
http://localhost:3001/api
```

### 1. Login As Admin (Get Token)

```bash
curl -X POST http://localhost:3001/api/auth/login \
	-H "Content-Type: application/json" \
	-d '{"username":"admin","password":"admin"}'
```

Copy the `token` value from the response and use it in `Authorization: Bearer <token>`.

### 2. List Users (Admin Only)

```bash
curl -X GET http://localhost:3001/api/admin/users \
	-H "Authorization: Bearer <token>"
```

### 3. Create User (Admin Only)

```bash
curl -X POST http://localhost:3001/api/admin/users \
	-H "Authorization: Bearer <token>" \
	-H "Content-Type: application/json" \
	-d '{
		"username":"newuser",
		"password":"pass1234",
		"displayName":"New User",
		"projectName":"New User Ledger",
		"role":"user"
	}'
```

Valid role values: `user`, `admin`

### 4. Update User (Admin Only)

Replace `<userId>` with the user id from list/create response.

```bash
curl -X PATCH http://localhost:3001/api/admin/users/<userId> \
	-H "Authorization: Bearer <token>" \
	-H "Content-Type: application/json" \
	-d '{
		"displayName":"Updated Name",
		"projectName":"Updated Project",
		"role":"user",
		"isActive":true,
		"password":"newpass1234"
	}'
```

You can send only the fields you want to change.

### 5. Login As Created User

```bash
curl -X POST http://localhost:3001/api/auth/login \
	-H "Content-Type: application/json" \
	-d '{"username":"newuser","password":"pass1234"}'
```

### Common Errors

- `401 Unauthorized`: Missing/invalid token or expired session.
- `403 Forbidden`: Logged-in user is not admin for admin routes.
- `409 Conflict`: Username already exists.
