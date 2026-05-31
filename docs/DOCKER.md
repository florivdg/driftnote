# Running Driftnote in Docker

The production runtime ships as a Bun-on-DHI container image built from the repo `Dockerfile`. The runtime stage is a [Docker Hardened Image](https://docs.docker.com/dhi/) (`dhi.io/bun`) — no shell, no package manager, nonroot (UID 65532).

## First-time setup

DHI images are pulled from `dhi.io`, not Docker Hub. Authenticate once per host:

```sh
docker login dhi.io
```

The DHI catalog is free and Apache 2.0 since 2025-12-17 — any Docker account works.

## Build

```sh
docker build -t driftnote .
# or
docker compose build
```

Bun version is pinned via `ARG BUN_VERSION` (default `1.3-alpine3.22`, matching the host's Bun 1.3.x). The full tag list is at https://hub.docker.com/hardened-images/catalog/dhi/bun/images. Bump it in `Dockerfile` and `docker-compose.yml` together.

## Run

```sh
docker run --rm -p 3000:3000 \
  -v driftnote_data:/app/data \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e BETTER_AUTH_URL=https://driftnote.example.com \
  driftnote
```

Or via Compose with a gitignored `.env` file next to `docker-compose.yml`:

```sh
# .env
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://driftnote.example.com
```

```sh
docker compose up -d
```

## Required environment variables

| Name                 | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Signing key for Better Auth sessions. 32+ bytes of randomness. |
| `BETTER_AUTH_URL`    | Server-side origin used by passkey verification.               |

The client-side `authClient` derives its base URL from `window.location.origin` at runtime — no `PUBLIC_BETTER_AUTH_URL` build arg or env var is needed. This assumes the app and its `/api/auth/*` routes share an origin (the standard driftnote deployment).

`HOST` and `PORT` are set in the image (`0.0.0.0:3000`) and rarely need overriding. The nonroot user cannot bind below 1024. If you do override `PORT`, the in-image `HEALTHCHECK` honors it automatically.

See [`CONFIGURATION.md`](./CONFIGURATION.md) for the full environment reference plus the reverse-proxy, CSP, on-device AI, and MCP/OAuth requirements.

## Reverse proxy & TLS

DriftNote expects to run behind a TLS-terminating reverse proxy. Two things must hold, or the app misbehaves in ways the container itself can't catch:

- **Forwarded headers.** The proxy must overwrite/strip client-supplied `X-Forwarded-*`, and the container port must not be reachable bypassing the proxy. The app rebuilds its request origin from those headers (`security.allowedDomains: [{}]`) for its CSRF check.
- **TLS for voice + a passthrough CSP.** Voice capture needs a secure context (HTTPS); `localhost` is exempt but a real host is not. The build-time CSP also allows specific Hugging Face / jsDelivr origins for on-device model downloads — a proxy or WAF that strips or rewrites the CSP header breaks the AI features.

The full forwarded-header contract and the exact CSP directive list live in [`CONFIGURATION.md`](./CONFIGURATION.md).

## Migrations

`scripts/serve.ts` runs `drizzle-orm/bun-sqlite/migrator` against `./drizzle/` on every container start, then hands off to `./dist/server/entry.mjs`. Pending migrations apply automatically — no separate step in the normal flow.

`scripts/migrate.ts` ships alongside `serve.ts` in the runtime image so you can run migrations against the live volume without restarting the app — useful when verifying a migration applied cleanly, re-applying after a rollback, or migrating a volume attached to a stopped container:

```sh
# against the running container (re-applies idempotently)
docker exec <container> bun scripts/migrate.ts

# against a stopped container's volume, without booting the server
docker run --rm -v driftnote_data:/app/data driftnote bun scripts/migrate.ts
```

Drizzle's migrator tracks applied migrations in an internal table, so re-running is a no-op once everything is up to date.

## Persistence

The SQLite database lives at `/app/data/driftnote.db` along with its WAL (`-wal`) and shared-memory (`-shm`) files. Compose declares a named volume `driftnote_data` mounted there; back the whole volume up as a unit. Never bind-mount a host directory that already contains the dev DB unless you intend to share it.

## Debugging a no-shell container

`docker exec <container> sh` will fail — the runtime image contains only `bun`, `bunx`, and CA certificates. Use [Docker Debug](https://docs.docker.com/reference/cli/docker/debug/) instead:

```sh
docker debug <container>
```

That attaches a debug shell with standard tooling without modifying the image itself.

For one-off checks you can also run `bun` directly:

```sh
docker exec <container> bun -e "console.log(process.versions)"
```

## Health check

The image's `HEALTHCHECK` uses `bun -e "fetch(...)..."` because `curl`/`wget` are not present. The probe URL is built from `process.env.PORT` (defaulting to `3000`), so overriding `PORT` doesn't break health. `/login` is in the middleware's `PUBLIC` set and always returns 200 without touching the database.

## Notes

- Lint, type-check, and fallow run on the **host** before building (`bun run format && bun run lint && bun run check && bun run fallow`). The runtime image ships no source tree.
- The build stage uses `dhi/bun:<ver>-dev` (root, shell, package tooling) only inside BuildKit; nothing from it ships in the runtime image.
- The `.dockerignore` excludes `./data/` — without that, your local dev database would be baked into the image.
