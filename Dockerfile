# syntax=docker/dockerfile:1.7
# Docker Hardened Images for Bun. Requires `docker login dhi.io` once per host.
# See https://hub.docker.com/hardened-images/catalog/dhi/bun for the tag catalog.
ARG BUN_VERSION=1.3-alpine3.22

FROM dhi.io/bun:${BUN_VERSION}-dev AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dhi.io/bun:${BUN_VERSION}-dev AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun --bun astro build \
 && mkdir -p data \
 && chown 65532:65532 data

FROM dhi.io/bun:${BUN_VERSION}-dev AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

FROM dhi.io/bun:${BUN_VERSION} AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/serve.ts /app/scripts/migrate.ts ./scripts/
COPY --from=build /app/src/lib/db ./src/lib/db
COPY --from=build --chown=65532:65532 /app/data ./data
EXPOSE 3000
VOLUME ["/app/data"]
USER 65532
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT||3000}/login`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "scripts/serve.ts"]
