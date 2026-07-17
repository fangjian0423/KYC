# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# better-sqlite3 is a native module and needs a toolchain to compile.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Copy pruned production deps (native modules already compiled in builder) + build output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

EXPOSE 5000

CMD ["node", "dist/index.js"]
