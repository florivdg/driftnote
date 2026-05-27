# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime

Bun is required, not just as a package manager — `src/lib/db/client.ts` imports `bun:sqlite`. All `astro` invocations must go through Bun's runtime; the npm scripts wrap them as `bun --bun astro …`. Running `astro dev` under Node will crash with `Cannot find module 'bun:sqlite'`. The same applies to `bun x auth@latest generate` — use `bunx --bun auth@latest generate …` so the generator can load `auth.ts`.

## Commands

| Command                                                                    | Purpose                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bun run dev`                                                              | Astro dev server on `:4321` (SSR + Vue islands)                                                        |
| `bun run build`                                                            | Production SSR bundle to `./dist/`                                                                     |
| `bun run start`                                                            | Run the standalone Node entrypoint from `./dist/server/entry.mjs`                                      |
| `bun run check`                                                            | `astro check` — type-checks `.astro`, `.ts`, and `.vue`                                                |
| `bun run lint`                                                             | Oxlint with type-aware rules (`oxlint-tsgolint`)                                                       |
| `bun run format`                                                           | Prettier `--write` (Astro plugin enabled)                                                              |
| `bun run format:check`                                                     | Prettier `--check` (use in CI)                                                                         |
| `bun run fallow`                                                           | Dead-code / duplication / complexity / health                                                          |
| `bun run db:generate`                                                      | Emit a new Drizzle migration to `./drizzle/`                                                           |
| `bun run db:migrate`                                                       | Apply pending migrations to `./data/driftnote.db`                                                      |
| `bunx --bun auth@latest generate --output src/lib/db/auth-schema.ts --yes` | Regenerate the Better Auth schema (run **before** `db:generate` so the migration includes auth tables) |

No automated tests exist. The v1 acceptance contract is the smoke flow: `/` → 302 to `/login`, register a passkey, `POST /api/ideas` with `#tag` persists, sidebar updates with the right hue.

## After every edit, run these — in order

Edits aren't complete until all four pass on the working tree:

1. `bun run format` — Prettier writes the canonical layout.
2. `bun run lint` — type-aware oxlint, must exit 0.
3. `bun run check` — `astro check`, 0 errors, 0 warnings, **and 0 hints** (hints often surface deprecation warnings like `ts(6387)` that block clean builds later).
4. `bun run fallow` — dead code, duplication, complexity all clean.

Run them in this order: format first (changes the bytes lint and check see), then lint (fast feedback on obvious bugs), then check (catches type regressions across `.astro`/`.ts`/`.vue`), then fallow (surfaces health issues the other three miss). Fix and rerun until each is clean before declaring the task done.

## Architecture

**SSR renders the page shell _and_ each island's initial state.** The home page (`src/pages/index.astro`) reads `?q`, `?tags`, `?untagged`, `?source` from the URL, runs the stream + tag-list queries server-side, and passes the results as `initial` props to the Vue islands. Each `client:load` island is rendered to HTML at SSR-time and hydrates over it — no fetch on first paint, no skeleton.

The home page mounts three top-level Vue islands plus the chrome:

- `<Sidebar />` (`src/components/islands/Sidebar.vue`) — owns the filter nav, tag list, and tag-color picker.
- `<StreamView />` (`src/components/islands/StreamView.vue`) — owns the FilterStrip, day groups, idea cards, and empty state.
- `<Composer />` — unchanged shape; on submit it dispatches a `streamchanged` event instead of navigating.

Plus `<SearchInput />`, `<ThemeToggle />`, `<UserMenu />` in the masthead.

**URL is the single source of truth for filters.** `src/lib/url-state.ts` is the glue:

- `applyURL(href, mode?)` — `history.pushState` (or `replaceState`) + dispatches a `urlchange` window event.
- `subscribeFilters(handler)` — handler runs on every `urlchange` and on `popstate`, with the parsed `Filters` for the new URL.
- `currentFilters()` / `readFilters(url)` / `filtersToSearch(filters)` — pure helpers on top of `src/lib/url.ts`.

Sidebar / StreamView / FilterStrip / IdeaCard all call `applyURL(...)` instead of navigating. Anchors keep their `href` so middle-click / cmd-click still open a new tab; the primary click handler calls `applyURL` with `event.preventDefault()`.

**Mutations dispatch `streamchanged`.** After a successful `POST /api/ideas` (Composer) or `PATCH /api/tags/[name]` (Sidebar's color picker), the originating island calls `notifyStreamChanged()` from `url-state.ts`. `StreamView` listens and refetches `GET /api/stream`; `Sidebar` listens and refetches `GET /api/tags`. Both fetchers reset a single `AbortController` per call, so fast typing or rapid mutations don't race.

**REST surface:**

- `GET /api/stream?q=&tags=&untagged=&source=` → `{ ideas, activeTagHues }`. Filter-dependent. `activeTagHues` echoes the `hue` for each `?tags=` value so `StreamView` can colour the FilterStrip chips even when no idea matches.
- `GET /api/tags` → `{ tagList, totalIdeas, untaggedCount, voiceCount }`. Filter-independent; refetched only after `streamchanged`.
- `POST /api/ideas`, `PATCH /api/tags/[name]` — unchanged.

The masthead's "N ENTRIES / N TAGS" counters and the issue header's "N unfinished thoughts" come from SSR and stay stable until the next full reload — by design, those are headline copy, not live counters.

**All other navigation is plain browser navigation.** No client-side router. Login redirects, sign-out, and MCP consent use `location.assign(...)`. `<a href>` links cause full page loads.

**FOUC-killer script** in `Layout.astro`'s `<body>` runs once per page load — no view transitions, no `data-astro-rerun`. Its body is CSP-hashed via `bun scripts/csp-fouc-hash.ts`; if the script body changes, re-run that and update `security.csp.scriptDirective.hashes` in `astro.config.mjs`.

**One Drizzle client, one SQLite connection.** `src/lib/db/client.ts` constructs a single `bun:sqlite` `Database`, runs `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON`, and exports `db`. App tables (`ideas`, `tags`, `idea_tags`) live in `src/lib/db/schema.ts`; Better Auth tables (`user`, `session`, `account`, `verification`, `passkey`) are re-exported from `auth-schema.ts`. `drizzle-kit` sees both, so there is one unified migration history under `./drizzle/`.

**Auth is passkey-only.** Better Auth + `@better-auth/passkey`, wired through `better-auth/adapters/drizzle`. Three non-obvious points:

1. `drizzleAdapter` **must** be passed `{ schema: authSchema }` — bun-sqlite drizzle doesn't auto-expose the schema, and without it the passkey model lookup fails at runtime.
2. The passkey plugin's `context` is a `string | null` query parameter — not an object. The client JSON-stringifies `{ name, email }` and passes it as `context: JSON.stringify(...)`; the server's `resolveUser` parses it back.
3. `verify-registration` does **not** create a session. The signup flow has to call `authClient.signIn.passkey()` after `addPasskey()` to actually log the new user in.

`src/lib/db/auth-schema.ts` is **generated** — never hand-edit. Customize user fields via Better Auth's `additionalFields` in `auth.ts`, then regenerate.

**Middleware** (`src/middleware.ts`) attaches the session to `ctx.locals.{user, session}` on every request, then decides: pass, redirect to `/login?next=…`, or return a JSON 401. API routes (`/api/*`) get 401, page routes get the redirect. Routes in `PUBLIC` (login, `/api/auth/*`, static assets) skip the user check.

**Tag colors are derived, not stored.** Each tag has one integer `hue` (0–360). Theme-scoped CSS variables (`--tag-stripe-L/C`, `--tag-tint-L/C`, etc.) combine with that hue to render the card stripe, tint, sidebar dot, and stamps. Unknown tags get a deterministic hue from `defaultHueFor()` (FNV-1a hash of the name into `HUE_CHOICES`). When a user picks a new color, `PATCH /api/tags/[name]` updates the row, the Sidebar dispatches `streamchanged`, and both `StreamView` and `Sidebar` refetch so all card stripes / stamps / dots reflect the new hue.

**`bun x auth@latest`** must be invoked with `bunx --bun` to run under the Bun runtime — same `bun:sqlite` constraint as `astro dev`.

## Linting and codebase health

`bun run lint` runs oxlint with **type-aware** rules enabled (`options.typeAware: true` in `.oxlintrc.json`, backed by the `oxlint-tsgolint` dep). It catches real bugs that surface-level lint misses, e.g. `await` on synchronous Drizzle `.get()` calls. Keep it green.

`bun run fallow` is configured to be strict: dead code, duplication, and per-function complexity (CRAP) all gate. The CRAP threshold is **30**, which at the project's 0% automated coverage maps to a cyclomatic complexity of **5**. Treat any function reaching 5 cyc as needing extraction — `src/lib/validation.ts`, `src/lib/dom.ts`, and the per-clause helpers in `src/lib/ideas.ts` are examples of the pattern.

Two specific suppressions live in `.fallowrc.json`:

- `duplicates.ignore: ["src/lib/db/auth-schema.ts"]` — generated code; the session/account table shapes are unavoidably similar.
- `ignoreDependencies: ["@astrojs/node", "@astrojs/vue"]` — Astro integrations consumed only via `astro.config.mjs`, which fallow's plugin doesn't credit.

And one inline suppression: `// fallow-ignore-next-line unresolved-import` above the `new URL('./src', …)` line in `astro.config.mjs` (fallow's static scanner can't resolve the URL pattern).

## Styles

`src/styles/driftnote.css` was copied from the source design bundle at `~/Downloads/DriftNote/styles.css` (whitespace is now Prettier-controlled, but the rules and selectors haven't been edited). The token block at the top (`:root`, `body[data-theme="light"]`, `[data-density]`) is the contract — components depend on its variable names. Refactor only if a component genuinely diverges from the original markup.

Theme / density / sidebar side persist in `localStorage` (`driftnote_theme`, `driftnote_density`, `driftnote_sidebar`) — read by an inline FOUC-killer script at the top of `Layout.astro`'s `<body>`. No `user_prefs` table in v1.

## Docker

Prod runtime is containerized via the root `Dockerfile` on Docker Hardened Images (`dhi/bun` for runtime, `dhi/bun:*-dev` for build). See `docs/DOCKER.md` for build/run/env details. Three things that bite if forgotten:

1. The runtime image has **no shell**. `docker exec ... sh` fails by design — use `docker debug <container>` or `docker exec ... bun -e "..."` instead. The `HEALTHCHECK` uses `bun -e fetch(...)` for the same reason; don't replace it with `curl`.
2. `src/lib/db/client.ts` hard-codes `./data/driftnote.db`, so `/app/data` must be a writable volume (compose declares `driftnote_data`). `.dockerignore` excludes `./data/` — without that exclusion the local dev DB would be baked into the image.
3. Migrations run on container start via `scripts/serve.ts` (migrate → `await import("../dist/server/entry.mjs")`). There is no separate migration step in the prod flow; if you add a migration that needs a different ordering (e.g. zero-downtime), revisit that script rather than the Dockerfile.
