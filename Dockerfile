# Multi-stage build: frontend (Vite/React) + backend (Express) en server/.
# Basado en templates/Dockerfile.node de loqui-platform.

# -- Frontend build --------------------------------------------
FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json ./
COPY src ./src
RUN npm run build

# -- Backend deps (build tools para dependencias nativas, ej. better-sqlite3) --
FROM node:22-bookworm-slim AS backend-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# -- Runtime ------------------------------------------------------
FROM node:22-bookworm-slim
WORKDIR /app
COPY server ./server
COPY --from=backend-deps /app/server/node_modules ./server/node_modules
COPY --from=frontend /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
CMD ["node", "server/src/server.js"]
