FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --production=false

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json tsconfig*.json postcss.config.js tailwind.config.ts next.config.ts ./
RUN npm ci
COPY src ./src
COPY playlists ./playlists
RUN mkdir -p /app/public && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.ts tsconfig.json ./
COPY --from=builder /app/src/server ./src/server
COPY playlists ./playlists
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "server.ts"]
