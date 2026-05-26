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

No automated tests exist. The v1 acceptance contract is the manual checklist in `docs/` and the smoke flow: `/` → 302 to `/login`, register a passkey, `POST /api/ideas` with `#tag` persists, sidebar updates with the right hue.

## After every edit, run these — in order

Edits aren't complete until all four pass on the working tree:

1. `bun run format` — Prettier writes the canonical layout.
2. `bun run lint` — type-aware oxlint, must exit 0.
3. `bun run check` — `astro check`, 0 errors, 0 warnings, **and 0 hints** (hints often surface deprecation warnings like `ts(6387)` that block clean builds later).
4. `bun run fallow` — dead code, duplication, complexity all clean.

Run them in this order: format first (changes the bytes lint and check see), then lint (fast feedback on obvious bugs), then check (catches type regressions across `.astro`/`.ts`/`.vue`), then fallow (surfaces health issues the other three miss). Fix and rerun until each is clean before declaring the task done.

## Architecture

The planning docs at `docs/{README,DESIGN,DATA_MODEL,AUTH}.md` are the contract. Read them before non-trivial work — they explain _why_ decisions were made.

**SSR is the authority.** The home page (`src/pages/index.astro`) reads `?q`, `?tags`, `?untagged`, `?source` from the URL and runs the stream + tag-list queries server-side. Vue islands (5 of them — `Composer`, `SideTag`/`ColorPicker`, `ThemeToggle`, `SearchInput`, `LoginForm`) handle interactivity only; they never own the stream's render. `SearchInput` debounces input and hands off to Astro's view-transition router — there is no client-side stream patching, by design.

**Navigation uses Astro's `<ClientRouter />` (view transitions).** Rendered once in `Layout.astro`'s `<head>`. Every link, form, and programmatic `navigate(...)` triggers an SSR fetch + DOM swap rather than a full page reload. Three consequences worth knowing before editing:

1. `SearchInput` is mounted with `transition:persist` in `Masthead.astro` so the input's DOM node and Vue state survive the swap — focus and caret stay where the user left them between keystrokes. Other islands re-hydrate on each swap.
2. Programmatic navigation from islands must call `navigate()` from `astro:transitions/client`, not `location.assign` / `location.href`. The router does not intercept raw `location.*` writes — using them causes a full reload and defeats `transition:persist`.
3. Inline `<script is:inline>` blocks do **not** re-run after a swap by default. Anything that must run on every page (the `Layout.astro` FOUC-killer is the current example) needs `data-astro-rerun`. Changing the script body still requires re-hashing for CSP via `bun scripts/csp-fouc-hash.ts`; the attribute does not affect the hash.

**One Drizzle client, one SQLite connection.** `src/lib/db/client.ts` constructs a single `bun:sqlite` `Database`, runs `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON`, and exports `db`. App tables (`ideas`, `tags`, `idea_tags`) live in `src/lib/db/schema.ts`; Better Auth tables (`user`, `session`, `account`, `verification`, `passkey`) are re-exported from `auth-schema.ts`. `drizzle-kit` sees both, so there is one unified migration history under `./drizzle/`.

**Auth is passkey-only.** Better Auth + `@better-auth/passkey`, wired through `better-auth/adapters/drizzle`. Three non-obvious points:

1. `drizzleAdapter` **must** be passed `{ schema: authSchema }` — bun-sqlite drizzle doesn't auto-expose the schema, and without it the passkey model lookup fails at runtime.
2. The passkey plugin's `context` is a `string | null` query parameter — not an object. The client JSON-stringifies `{ name, email }` and passes it as `context: JSON.stringify(...)`; the server's `resolveUser` parses it back.
3. `verify-registration` does **not** create a session. The signup flow has to call `authClient.signIn.passkey()` after `addPasskey()` to actually log the new user in.

`src/lib/db/auth-schema.ts` is **generated** — never hand-edit. Customize user fields via Better Auth's `additionalFields` in `auth.ts`, then regenerate.

**Middleware** (`src/middleware.ts`) attaches the session to `ctx.locals.{user, session}` on every request, then decides: pass, redirect to `/login?next=…`, or return a JSON 401. API routes (`/api/*`) get 401, page routes get the redirect. Routes in `PUBLIC` (login, `/api/auth/*`, static assets) skip the user check.

**Tag colors are derived, not stored.** Each tag has one integer `hue` (0–360). Theme-scoped CSS variables (`--tag-stripe-L/C`, `--tag-tint-L/C`, etc.) combine with that hue to render the card stripe, tint, sidebar dot, and stamps. Unknown tags get a deterministic hue from `defaultHueFor()` (FNV-1a hash of the name into `HUE_CHOICES`). When a user picks a new color, `PATCH /api/tags/[name]` updates the row and the SideTag island reloads so all SSR'd cards refresh together.

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
