# DriftNote — Auth

## Goal

Passkey-only sign-in. No passwords, no OAuth, no magic links. A user creates an account with a platform authenticator (Touch ID, Windows Hello, security key) and signs in the same way. The session is a server cookie.

## Why passkey-only

- The design's email/password fields are aesthetic; the real product brief is "a notebook that doesn't ask anything of you" — including a password.
- Passkeys are phishing-resistant and don't need any reset/recovery infrastructure for v1 (a passkey is bound to the device; users register a new one if they lose access).
- One auth path = one set of edge cases.

Trade-off acknowledged: a user who loses every passkey-bearing device is locked out. v2 will add an account-recovery flow (paper backup code, additional passkey on a second device).

## Library: Better Auth

`better-auth` core + `@better-auth/passkey` plugin (separate npm package as of Better Auth 1.5+). We do **not** use `emailAndPassword`. The plugin handles WebAuthn ceremony (challenge generation, attestation verification, credential storage in the `passkey` table) on top of `@simplewebauthn/server`.

Mount at a single catch-all route in Astro:

```
src/pages/api/auth/[...all].ts
```

```ts
import { auth } from "@/lib/auth";
import type { APIRoute } from "astro";

export const ALL: APIRoute = ({ request }) => auth.handler(request);
```

## Server config — `src/lib/auth.ts`

We use Better Auth's **Drizzle adapter** so Better Auth's tables live in the same Drizzle schema and migration history as our app tables. No separate driver, no dual handle.

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { db } from "@/lib/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET!, // 32+ random bytes
  baseURL: process.env.BETTER_AUTH_URL!, // e.g. http://localhost:4321
  emailAndPassword: { enabled: false },
  socialProviders: {},
  plugins: [
    passkey({
      rpID: new URL(process.env.BETTER_AUTH_URL!).hostname,
      rpName: "DriftNote",
      // Allow registering a passkey without an existing session — required for
      // passkey-first signup (the user has no account yet when they create
      // their first credential).
      registration: {
        requireSession: false,
        resolveUser: async ({ context }) => {
          // `context` is the opaque payload posted from the client below.
          // For v1: trust it (login route is public), create or load the user.
          // For v2: sign it with a short-lived JWT to prevent CSRF.
          const { name, email } = context as { name: string; email: string };
          // Upsert into our `user` table via Drizzle. Better Auth's adapter
          // owns the schema; we call its internal `createUser` via auth.api,
          // or insert directly using the generated `user` table.
          // See AUTH-IMPL note below.
          return { id: /* new id */ "", name, email };
        },
      },
    }),
  ],
});
```

> **AUTH-IMPL note**: the exact `resolveUser` body depends on Better Auth's
> internal user-creation helper. Two viable shapes:
>
> 1. `await auth.api.signUpEmail(...)` — won't work, passwords disabled.
> 2. Direct Drizzle insert into `user` (id = `Bun.randomUUIDv7()`, emailVerified = false).
>
> Confirm against Better Auth's `createUser` ctx helper during implementation;
> the plugin's `ctx` argument exposes it. Filed as TODO in the implementation
> kickoff.

`origin` is **not** a top-level passkey option — Better Auth derives the
expected origin from `baseURL`. If you need to allow multiple origins
(e.g. localhost + a tunnel domain), use the `trustedOrigins` config on
`betterAuth({ ... })`.

Env vars (`.env`, never committed):

```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:4321
```

In production, `BETTER_AUTH_URL` must match the deployed origin (passkeys are bound to `rpID`/origin — changing host invalidates credentials).

## Client — `src/lib/auth-client.ts`

```ts
import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [passkeyClient()],
});
```

`window.location.origin` is the runtime origin the browser already resolved, so the same image works behind any reverse proxy / hostname without rebuilds. The file is only ever imported by client islands, so `window` is guaranteed to exist at module-eval time.

Used inside the Vue login island:

```ts
// First-time signup (passkey-first):
// Posts `context` to the passkey registration endpoint; `resolveUser` on the
// server creates the user + persists the new credential atomically.
await authClient.passkey.addPasskey({
  name: "DriftNote on this device",
  // The plugin forwards `context` to server.registration.resolveUser
  context: { name, email },
});

// Returning-user sign in (platform authenticator prompt):
await authClient.signIn.passkey();

// Add another passkey while already signed in (later, settings page):
// await authClient.passkey.addPasskey({ name: "Backup security key" });
```

> The exact client method name (`passkey.addPasskey` vs an alias) is confirmed
> in `@better-auth/passkey` docs ([source](https://better-auth.com/docs/plugins/passkey)).
> Earlier Better Auth versions exposed `signUp.passkey` directly — that has
> been replaced by the registration-with-context pattern above to support
> passkey-first onboarding without a pre-existing session.

After success the server sets the session cookie; we `location.href = "/"` to land on the stream.

## Middleware — `src/middleware.ts`

```ts
import { defineMiddleware } from "astro:middleware";
import { auth } from "@/lib/auth";

const PUBLIC = [/^\/login$/, /^\/api\/auth(\/|$)/, /^\/_astro\//, /^\/favicon/];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const session = await auth.api.getSession({ headers: ctx.request.headers });
  ctx.locals.user = session?.user ?? null;
  ctx.locals.session = session?.session ?? null;

  const path = new URL(ctx.request.url).pathname;
  const isPublic = PUBLIC.some((re) => re.test(path));
  if (!ctx.locals.user && !isPublic) {
    return ctx.redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (ctx.locals.user && path === "/login") {
    return ctx.redirect("/");
  }
  return next();
});
```

`ctx.locals.user.id` is then the foreign key for all idea/tag queries.

Typing: add to `src/env.d.ts`:

```ts
declare namespace App {
  interface Locals {
    user: {
      id: string;
      name?: string;
      email?: string;
      image?: string | null;
    } | null;
    session: {
      id: string;
      token: string;
      userId: string;
      expiresAt: Date;
    } | null;
  }
}
```

## Login UX (port from `login.jsx`)

- **Two tabs** "Sign in" / "Create account" — both surface the passkey button. Sign in calls `signIn.passkey()`; Create calls `signUp.passkey({ name, email })`.
- **Drop** the email + password fields. Keep the `name` and `email` inputs **only on the Create tab** — Better Auth's passkey signup needs them to seed the user row.
- **Drop** the "Just let me dump ideas — no account" guest link for v1 (out of scope; tracked separately).
- Keep all of `.login`, `.login-left`, `.login-right`, `.login-card` styles unchanged.

## Sign out

`POST /api/auth/sign-out` — provided by Better Auth's handler. Wire it up to the avatar dropdown (or for v1, a hidden form posted by a sign-out menu item).

## Session lifecycle

- Default cookie: HTTP-only, SameSite=Lax, 30-day rolling. Configure in `betterAuth({ session: { ... } })` if a different policy is needed.
- The `passkey` table grows by one row per registered authenticator. A user can register additional passkeys from a settings page (deferred — `/settings/passkeys` is v2).

## Threat model notes

- **Phishing**: WebAuthn binds credentials to `rpID`, so a lookalike domain cannot reuse a passkey. ✓
- **CSRF**: Better Auth sets SameSite=Lax cookies. State-changing endpoints (`POST /api/ideas`, `PATCH /api/tags/:name`) check session via middleware. Add an `Origin` header check on POST endpoints if we ever loosen SameSite.
- **Replay**: WebAuthn includes a challenge per ceremony, server-verified by Better Auth.
- **Account takeover via stolen session cookie**: standard mitigation — HTTP-only cookie, no `localStorage` storage of tokens, short rolling expiry.

## Tasks before first run

1. `bun add better-auth @better-auth/passkey`
   ([@better-auth/passkey on npm](https://www.npmjs.com/package/@better-auth/passkey)).
   `@simplewebauthn/server` is a transitive dep — no need to add it explicitly.
2. `echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env` and
   `echo "BETTER_AUTH_URL=http://localhost:4321" >> .env`.
3. **Generate auth schema** with the new CLI:
   ```sh
   bun x auth@latest generate --output src/lib/db/auth-schema.ts --yes
   ```
   The package is just `auth` (previously `@better-auth/cli`, now deprecated).
   This emits Drizzle definitions for `user / session / account / verification`
   - the `passkey` table contributed by the plugin. Re-export those from
     `src/lib/db/schema.ts` so they're part of one Drizzle schema.
4. `bun run db:generate && bun run db:migrate` to materialize the tables.
5. Test passkey registration locally:
   - **macOS Safari / iOS Safari** — Touch ID / Face ID (platform authenticator).
   - **Chrome / Edge** — Touch ID on macOS, Windows Hello on Windows, or any roaming security key.
   - **Firefox** — Supports WebAuthn but platform-authenticator support is uneven; roaming keys work universally.
