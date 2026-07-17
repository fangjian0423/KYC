# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Leave VITE_BACKEND_API_URL empty so the SPA calls same-origin /api/*, which nginx
# reverse-proxies to the internal backend. Only override for special build setups.
ARG VITE_BACKEND_API_URL=
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL

RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled SPA from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx runs envsubst on templates at startup. Restrict substitution to BACKEND_*
# variables so nginx's own $uri/$host are preserved. BACKEND_URL is provided at
# runtime (ACA env var) and points at the internal backend Container App.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^BACKEND_
ENV BACKEND_URL=http://127.0.0.1:5000

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
