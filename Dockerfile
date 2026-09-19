# syntax=docker/dockerfile:1

# Debian rather than Alpine. better-sqlite3 and @node-rs/argon2 publish
# prebuilt binaries for glibc; on musl they are always compiled from source,
# which means a slower build and a toolchain in every stage for no benefit.

# ---------------------------------------------------------------- base deps --
FROM node:24-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 falls back to compiling from source whenever prebuild-install
# cannot match the exact Node ABI, which it cannot here. The toolchain lives in
# this stage only and never reaches the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci


# ---------------------------------------------------------------- dev image --
# Used by docker-compose.dev.yml. Source is bind-mounted over /app at runtime,
# so this stage holds only the dependencies and the toolchain to build them.
FROM deps AS dev

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    PORT=3000

RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "run", "dev"]


# ------------------------------------------------------------------- build ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Baked in so a running container can say what it is, and so it can tell
# whether a published release is newer than itself. A build without these
# reports "dev", which is the honest answer for an image built from a working
# tree rather than from a tag.
ARG APP_VERSION=dev
ARG GIT_SHA=""
ARG BUILT_AT=""
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION \
    NEXT_PUBLIC_GIT_SHA=$GIT_SHA \
    NEXT_PUBLIC_BUILT_AT=$BUILT_AT

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# ----------------------------------------------------------------- runtime ---
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
# sqlite3 is for backing up a running database and reading the mail log. The
# deployment notes tell an operator to run it, so it has to actually be here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata wget sqlite3 \
 && rm -rf /var/lib/apt/lists/*

# The standalone output is a self-contained server: only the traced
# dependencies, no full node_modules tree.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Migrations are read from ./drizzle at runtime and are not part of the traced
# bundle, so they must be copied explicitly.
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
