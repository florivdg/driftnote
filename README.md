# DriftNote

A notebook that doesn't ask anything of you — a reverse-chronological stream of ideas, tagged by hashtag, captured by text or voice. Astro 6 SSR + Vue islands + Drizzle on bun:sqlite + Better Auth (passkey-only).

## Local setup

Requires **Bun** (the runtime, not just the package manager) — `bun:sqlite` is a Bun built-in.

```sh
bun install
cp .env.example .env
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env  # if .env wasn't seeded
bun x auth@latest generate --output src/lib/db/auth-schema.ts --yes
bun run db:generate
bun run db:migrate
bun run dev
```

Then visit `http://localhost:4321` — you'll be redirected to `/login`. Register a passkey (Touch ID on macOS Safari is the smoothest path) and you'll land on the stream.

## Scripts

| Command               | Action                                            |
| --------------------- | ------------------------------------------------- |
| `bun run dev`         | Start the dev server under the Bun runtime        |
| `bun run build`       | Build the SSR bundle to `./dist/`                 |
| `bun run preview`     | Preview the production build                      |
| `bun run start`       | Run the standalone Node SSR entry from `./dist/`  |
| `bun run check`       | Type-check with `astro check`                     |
| `bun run db:generate` | Emit a new Drizzle migration to `./drizzle/`      |
| `bun run db:migrate`  | Apply pending migrations to `./data/driftnote.db` |
| `bun run db:studio`   | Open Drizzle Studio                               |

## Architecture (one-liners)

- **Astro 6 SSR** with the node standalone adapter; islands hydrated via `@astrojs/vue`.
- **bun:sqlite** + Drizzle — single connection (`src/lib/db/client.ts`); WAL + foreign keys on at boot.
- **Better Auth** with the passkey plugin only; wired via the Drizzle adapter so auth tables share one migration history with app tables.
- **Tag colors** are OKLCH — each tag carries a hue 0–360; cards, chips, sidebar dots, stamps all derive their final color via theme-scoped L/C tokens.
