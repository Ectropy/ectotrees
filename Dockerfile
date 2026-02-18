FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV PORT=3001

COPY package*.json ./
RUN npm ci --include=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/tsconfig*.json ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "server"]
