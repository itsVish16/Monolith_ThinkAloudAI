# =============================================================================
# Frontend production image: Vite build -> nginx static hosting + API proxy
# =============================================================================
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# "/" makes the app call /api/v1/... on the same origin (proxied by nginx)
ARG VITE_API_URL=/
ENV VITE_API_URL=${VITE_API_URL}

# Optional: comma-separated admin emails (shows the Admin Console)
ARG VITE_ADMIN_EMAILS=
ENV VITE_ADMIN_EMAILS=${VITE_ADMIN_EMAILS}

RUN npm run build

# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
