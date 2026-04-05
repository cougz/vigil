FROM node:22-alpine AS builder
WORKDIR /build
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

FROM node:22-alpine AS runtime

RUN addgroup -S vigil && adduser -S vigil -G vigil

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=builder /build/dist ./public

RUN mkdir -p /data && chown vigil:vigil /data && chown -R vigil:vigil /app

USER vigil

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_PATH=/data \
    LOG_LEVEL=info

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "index.js"]
