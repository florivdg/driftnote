# DriftNote — docs

Planning docs for the Astro implementation of the DriftNote design.

| Doc                              | What's in it                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [DESIGN.md](./DESIGN.md)         | Tokens (colors, type, density), OKLCH tag-color formula, component inventory, what we port vs. drop from the design bundle.           |
| [DATA_MODEL.md](./DATA_MODEL.md) | Drizzle schema (`user`, `ideas`, `tags`, `idea_tags`), query patterns for stream + sidebar, bun:sqlite specifics, migration strategy. |
| [AUTH.md](./AUTH.md)             | Better Auth passkey-only setup, server + client config, middleware, login UX delta from the design.                                   |

## Source design bundle

The design lives at `~/Downloads/DriftNote/` (a React + Babel-in-browser sketch). It has no README — `index.html` and the per-feature `.jsx` files are the spec. The planning docs here translate that sketch into the real stack:

- **Astro 6** with SSR (`@astrojs/node` standalone adapter).
- **`@astrojs/vue`** for interactive islands (composer, color picker, theme toggle, search).
- **Drizzle ORM** on **`bun:sqlite`** (file at `./data/driftnote.db`, migrations in `./drizzle/`).
- **Better Auth** with the passkey plugin only.

## Stack rationale (one line each)

- **Astro SSR**: server-rendered editorial layout fits the design (most of the page is static markup); islands only where state actually changes. `output: "server"` + `@astrojs/node` in standalone mode. (`hybrid` was removed in Astro 5 — only `static` and `server` exist now.)
- **Vue islands**: chosen by the user. `@astrojs/vue` integration, mount each interactive component with `client:load` / `client:idle`. No global Vue app — each island is its own root.
- **bun:sqlite**: zero-dep, in-process, fast. Matches Bun-first repo. Single-user write rate makes SQLite a safe default well past v1.
- **Drizzle + drizzle-kit**: typed schema, migration files in git, no separate query builder. The `bun-sqlite` adapter ships in `drizzle-orm` (`drizzle-orm/bun-sqlite`).
- **Better Auth + `@better-auth/passkey`**: WebAuthn + platform authenticator is the lowest-friction modern sign-in. Better Auth wraps `@simplewebauthn/server`, persists credentials into our SQLite via its **Drizzle adapter** (`better-auth/adapters/drizzle`) — same connection as our app tables, single migration history.

## Local setup (will work once implementation lands)

```sh
bun install
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "BETTER_AUTH_URL=http://localhost:4321" >> .env
bun x auth@latest generate --output src/lib/db/auth-schema.ts --yes
bun run db:generate       # drizzle-kit emits ./drizzle/000N_xxx.sql
bun run db:migrate        # applies ./drizzle/*.sql to ./data/driftnote.db
bun dev
```

Visit `http://localhost:4321` → redirected to `/login` → register a passkey → land on the stream.

## External references (verified during planning)

| Topic                               | Doc                                                           |
| ----------------------------------- | ------------------------------------------------------------- |
| Better Auth Drizzle adapter         | <https://better-auth.com/docs/adapters/drizzle>               |
| Better Auth SQLite + bun:sqlite     | <https://better-auth.com/docs/adapters/sqlite>                |
| Better Auth passkey plugin          | <https://better-auth.com/docs/plugins/passkey>                |
| Better Auth CLI (`npx auth@latest`) | <https://better-auth.com/docs/concepts/cli>                   |
| Drizzle bun:sqlite                  | <https://orm.drizzle.team/docs/connect-bun-sqlite>            |
| Drizzle bun:sqlite quick-start      | <https://orm.drizzle.team/docs/get-started/bun-sqlite-new>    |
| Astro `@astrojs/node` adapter       | <https://docs.astro.build/en/guides/integrations-guide/node/> |
| Astro `@astrojs/vue` integration    | <https://docs.astro.build/en/guides/integrations-guide/vue/>  |
| Astro middleware                    | <https://docs.astro.build/en/guides/middleware/>              |
| Astro 5 upgrade — `hybrid` removed  | <https://docs.astro.build/en/guides/upgrade-to/v5/>           |

## Status

Planning docs only. Implementation starts from the approved plan at `~/.claude/plans/fetch-this-design-file-cozy-cascade.md`. Plan and docs were verified against current library documentation via context7 + web search; corrections applied to AUTH.md, DATA_MODEL.md, and the plan file.
