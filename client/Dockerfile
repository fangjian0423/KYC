# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Inject build-time env (override via --build-arg or ACA env at build time)
ARG VITE_BACKEND_API_URL=http://localhost:5000
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL

RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled SPA from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config to support React client-side routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
