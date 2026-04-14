# Stage 1: Build frontend and install all deps
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com

COPY . .
RUN npx vite build

# Prune dev dependencies so only production deps remain
RUN npm prune --omit=dev

# Stage 2: Production server
FROM node:20-alpine

WORKDIR /app

# Copy production node_modules from builder (no second npm install)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json server.cjs ./

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server.cjs"]
