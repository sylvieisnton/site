FROM oven/bun:1-alpine AS base
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    CONFIG_DIR=/config \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

COPY src/data/example.profile.json /config/profile.json
COPY src/data/example.bot.json /config/bot.json
COPY src/data/example.content.json /config/content.json

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["bun", "src/server.ts"]
