FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS final
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/

ENV NODE_ENV=production \
    EB_PORT=8080 \
    LOG_LEVEL=info

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/eb/health || exit 1

USER node
CMD ["node", "src/core/server.js"]
