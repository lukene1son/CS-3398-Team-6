# Production frontend: built once, then served as plain static files.
#
# Stage 1 compiles the React app with Vite (npm run build -> dist/). Stage 2 is a small
# Caddy file server holding ONLY dist/: no Node, no source code, no node_modules, no Vite
# dev server. (The dev server is for local development only: it serves the raw source and
# has had file-read vulnerabilities, so it must never face the internet.)
# The site's main Caddy (root Caddyfile) sends /api/* to the backend and everything else here.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2.8-alpine
COPY static.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 5173
