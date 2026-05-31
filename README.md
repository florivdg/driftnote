# DriftNote

A notebook that doesn't ask anything of you — a reverse-chronological stream of ideas, tagged by hashtag, captured by text or voice. The AI runs entirely on-device. Astro 6 SSR + Vue islands + Drizzle on bun:sqlite + Better Auth (passkey-only).

## Features

- **Stream + tags** — reverse-chronological notes, tagged by `#hashtag`; each tag carries a hue that colors cards, chips, sidebar dots, and stamps (OKLCH, derived not stored).
- **Voice capture** — record a memo and transcribe it on-device with Whisper. Needs HTTPS (the mic requires a secure context); press `M` to start/stop.
- **Related notes** — on-device embeddings (EmbeddingGemma) index your notes in the background; permalink pages show the nearest neighbors by cosine similarity.
- **Retrieval & organization** — permalinks (`/i/[id]`), archive, pin-to-top, text/date filters, and sort.
- **Data export** — download everything as JSON or Markdown: `GET /api/export?format=json|md`.
- **Account** — `/account` manages passkeys and sessions and can delete the account.
- **MCP server** — query your notes from MCP clients over OAuth (`/api/mcp`); see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
- **Onboarding** — a first-run empty state for accounts with zero notes; `/ml-selftest` diagnoses the on-device model runtime.

> The AI features download model weights (tens to hundreds of MB) from the Hugging Face hub on first use, then cache them in the browser.

## Local setup

Requires **Bun** (the runtime, not just the package manager) — `bun:sqlite` is a Bun built-in.

```sh
bun install
cp .env.example .env
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env  # if .env wasn't seeded
bunx --bun auth@latest generate --output src/lib/db/auth-schema.ts --yes
bun run db:generate
bun run db:migrate
bun run dev
```

`db:migrate` applies all pending migrations (including the embeddings table) in one step — no extra setup. Then visit `http://localhost:4321` — you'll be redirected to `/login`. Register a passkey (Touch ID on macOS Safari is the smoothest path) and you'll land on the stream.

## Scripts

| Command                | Action                                              |
| ---------------------- | --------------------------------------------------- |
| `bun run dev`          | Start the dev server under the Bun runtime          |
| `bun run build`        | Build the SSR bundle to `./dist/`                   |
| `bun run preview`      | Preview the production build                        |
| `bun run start`        | Run the standalone SSR entry from `./dist/`         |
| `bun run check`        | Type-check with `astro check`                       |
| `bun run lint`         | Type-aware oxlint                                   |
| `bun run format`       | Prettier `--write`                                  |
| `bun run format:check` | Prettier `--check` (CI)                             |
| `bun run fallow`       | Dead code / duplication / complexity / health       |
| `bun run csp:hash`     | Recompute the FOUC-killer CSP hash                  |
| `bun run db:generate`  | Emit a new Drizzle migration to `./drizzle/`        |
| `bun run db:migrate`   | Apply pending migrations (`bun scripts/migrate.ts`) |
| `bun run db:studio`    | Open Drizzle Studio                                 |
| `bun run seed`         | Seed the database                                   |

## Architecture (one-liners)

- **Astro 6 SSR** with the node standalone adapter; islands hydrated via `@astrojs/vue`.
- **bun:sqlite** + Drizzle — single connection (`src/lib/db/client.ts`); WAL + foreign keys on at boot.
- **Better Auth** with the passkey plugin only; wired via the Drizzle adapter so auth tables share one migration history with app tables. The `mcp` plugin exposes an OAuth-gated MCP server.
- **Tag colors** are OKLCH — each tag carries a hue 0–360; cards, chips, sidebar dots, stamps all derive their final color via theme-scoped L/C tokens.
- **On-device AI** — `@huggingface/transformers` runs in a Web Worker (WebGPU with WASM fallback); weights load from the HF hub and cache in the browser. Code in `src/lib/ml/*`, `src/lib/embed-model.ts`, `src/lib/voice*.ts`.

## Deployment

Self-hosted via Docker — see [docs/DOCKER.md](docs/DOCKER.md) for the container build/run. Environment variables, reverse-proxy and CSP requirements, on-device AI, and the MCP/OAuth surface — see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
