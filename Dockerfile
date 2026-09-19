# syntax=docker/dockerfile:1

# Debian rather than Alpine. better-sqlite3 and @node-rs/argon2 both publish
# prebuilt binaries for glibc; on musl they would be compiled from source,
# which means shipping a toolchain and a far slower build for no benefit.

FROM node:24-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 falls back to compiling from source whenever prebuild-install
# cannot match the exact Node ABI. Carrying a toolchain in this stage makes the
# build work either way; none of it reaches the runtime image.
RUN apt-get update  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci


FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

# tzdata so TZ=Australia/Sydney resolves to real rules rather than UTC —
# without it, due dates land on the wrong day for half the year.
# wget is for the healthcheck below.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata wget \
 && rm -rf /var/lib/apt/lists/*

# The standalone output is a self-contained server: only the traced
# dependencies, no full node_modules tree.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Migrations are read at runtime from ./drizzle and are not part of the
# traced bundle, so they must be copied explicitly.
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

# The image's own /data is a fallback for running without a volume. A real
# deployment mounts over it, and the mount must be writable by uid 1000.
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
