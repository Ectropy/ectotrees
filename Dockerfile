# Digest-pinned so the tag cannot change underneath a rebuild; Dependabot's
# docker ecosystem bumps the digest alongside the tag.
FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS build
WORKDIR /app

# Install main app deps
COPY package*.json .npmrc ./
RUN npm ci

# Install alt1 plugin deps (before copying source so this layer is cached)
COPY alt1-plugin/package*.json ./alt1-plugin/
RUN cd alt1-plugin && npm ci

# Copy all source
COPY . .

# Optional override for the WebSocket base URL baked into the Alt1 plugin
# bundle (alt1-plugin/.env.production points at the upstream server). Vite lets
# a process env var take precedence over .env files, so only export it when set
# — an empty VITE_WS_BASE would otherwise override the file with nothing.
ARG ECTOTREES_WS_BASE
RUN if [ -n "$ECTOTREES_WS_BASE" ]; then export VITE_WS_BASE="$ECTOTREES_WS_BASE"; fi && npm run build

FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS runtime
WORKDIR /app
ENV PORT=3001

COPY package*.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/tsconfig*.json ./

# Run as the unprivileged `node` user (uid 1000) that the base image ships.
# /app/data is the default DATA_DIR mount point; a bind-mounted host directory
# must be writable by uid 1000 (see docker-compose.example.yml).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
# Run node directly as PID 1 (not via npm, whose signal forwarding is
# unreliable) so SIGTERM from `docker stop` reaches the shutdown handler
# and the session state flush actually runs.
CMD ["node", "--import", "tsx", "server/index.ts"]
