FROM node:24-alpine AS build
WORKDIR /app

# Install main app deps
COPY package*.json .npmrc ./
RUN npm ci

# Install alt1 plugin deps (before copying source so this layer is cached)
COPY alt1-plugin/package*.json ./alt1-plugin/
RUN cd alt1-plugin && npm ci

# Copy all source
COPY . .

# Build arg to override the production API URL baked into the alt1 plugin bundle.
# Defaults to the live server URL in vite.config.ts when not set.
ARG ECTOTREES_API
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV PORT=3001

COPY package*.json .npmrc ./
RUN npm ci --include=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/tsconfig*.json ./

ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["npm", "run", "server"]
