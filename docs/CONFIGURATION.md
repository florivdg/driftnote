# Configuring DriftNote

Everything an operator must get right when self-hosting. The container mechanics
live in [`DOCKER.md`](./DOCKER.md); this is the environment, network, and
security configuration that applies however you run the production build.

## Environment variables

| Name                          | Required          | Purpose                                                                                                                                                                                  |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | **Yes**           | Signing key for Better Auth sessions. Use 32+ bytes of randomness (`openssl rand -base64 32`).                                                                                           |
| `BETTER_AUTH_URL`             | **Yes** (in prod) | The public origin users visit. It is the OAuth issuer/resource base **and** the source of the passkey `rpID` (`new URL(BETTER_AUTH_URL).hostname`). Defaults to `http://localhost:4321`. |
| `HOST`                        | No                | Bind address. Set to `0.0.0.0` in the container image; rarely overridden.                                                                                                                |
| `PORT`                        | No                | Listen port. `3000` in the image. The nonroot container user cannot bind below 1024. The in-image `HEALTHCHECK` honors an override automatically.                                        |
| `DRIFTNOTE_AUTH_BYPASS`       | No                | **Local development only.** See [Security notes](#security-notes). Inert unless `BETTER_AUTH_URL` is localhost.                                                                          |
| `DRIFTNOTE_AUTH_BYPASS_EMAIL` | No                | Picks which existing user the bypass impersonates (defaults to the first row in the `user` table).                                                                                       |

There is **no `PUBLIC_BETTER_AUTH_URL`.** The browser auth client derives its
base URL from `window.location.origin` at runtime, so the app and its
`/api/auth/*` routes only need to share an origin (the standard deployment).

> `package.json` declares `engines.node >= 22.12.0`. That is an advisory floor
> for tooling and the Node-standalone `start` entry — the supported runtime is
> **Bun** (`bun:sqlite` is a hard dependency).

## Reverse proxy & forwarded headers

DriftNote runs behind a reverse proxy that terminates TLS. The Node adapter
otherwise computes the request origin as `https://localhost:3000`, which would
make the CSRF check in `src/middleware.ts` reject every same-origin mutation.
To fix that, `astro.config.mjs` sets `security.allowedDomains: [{}]`, which
trusts the proxy's `X-Forwarded-Host` / `X-Forwarded-Proto` (and the preserved
`Host` header) and rebuilds the real origin for any domain you deploy behind.

This is a **hard requirement**, not a suggestion:

- The proxy **MUST** overwrite or strip client-supplied `X-Forwarded-*` headers
  (Traefik does this by default; verify for nginx/Caddy/etc.). The app rebuilds
  its origin from those headers — spoofed values are an origin-spoofing risk.
- The container port **MUST NOT** be reachable in a way that bypasses the proxy.
- Terminate **TLS at the proxy.** Beyond the security baseline, voice capture
  requires a secure context — see [On-device AI requirements](#on-device-ai-requirements).

## Content Security Policy

The CSP is defined in `astro.config.mjs` and is **build-only** — it is emitted
by `bun run build` / `bun run start`, **not** by `astro dev` (Vite HMR uses
unnonced inline scripts). Always test the policy against a production build.

It is strict (no `unsafe-inline`; framework + FOUC-killer scripts are hashed).
The non-`'self'` origins it allows, and why:

| Directive     | Origins                                                                                         | Why                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `connect-src` | `huggingface.co`, `*.hf.co`, `cdn-lfs.huggingface.co`, `cdn-lfs-us-1.hf.co`, `cdn.jsdelivr.net` | On-device AI: model weights from the HF hub, ONNX Runtime WASM from jsDelivr. |
| `worker-src`  | `'self' blob:`                                                                                  | The Transformers.js model runs in a `blob:` Web Worker.                       |
| `script-src`  | `'self' 'wasm-unsafe-eval'` (+ script hashes)                                                   | `'wasm-unsafe-eval'` lets ONNX Runtime Web compile its WASM backend.          |
| `style-src`   | `'self' https://fonts.googleapis.com`                                                           | Google Fonts stylesheet.                                                      |
| `font-src`    | `https://fonts.gstatic.com`                                                                     | Google Fonts files.                                                           |
| `img-src`     | `'self' data:`                                                                                  | Inline data-URI images.                                                       |

Caveats:

- A WAF or proxy that **rewrites or strips the CSP header will break the AI
  features** (model download and worker startup are blocked).
- **No COOP/COEP headers are needed.** The WASM backend is single-threaded and
  does not use `SharedArrayBuffer`, so cross-origin isolation is not required.
- If you change the FOUC-killer inline script in `src/layouts/Layout.astro`,
  recompute its hash with `bun run csp:hash` and update
  `security.csp.scriptDirective.hashes` in `astro.config.mjs`.

Security headers that are **not** part of the CSP (`X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, and `Strict-Transport-Security` in
production) ship from `src/middleware.ts` on every response.

## On-device AI requirements

DriftNote's AI features run entirely in the user's browser via
[`@huggingface/transformers`](https://github.com/huggingface/transformers.js)
(a Web Worker, WebGPU with WASM fallback). Note bodies and audio never leave the
device for AI; only the resulting note text and embedding vectors are persisted.

What an operator needs to know:

- **First-use download.** Model weights are fetched from the HF hub the first
  time a user triggers a feature (tens to hundreds of MB), then cached by the
  browser. The CSP origins above must reach the client.
- **Voice requires HTTPS.** `getUserMedia` needs a secure context.
  `localhost` is exempt, but any non-localhost deployment must serve over TLS or
  the mic is unavailable. The failure is graceful — the UI shows "Voice capture
  needs a secure (HTTPS) connection." rather than crashing.
- **No GPU required.** WebGPU is used when available and falls back to WASM
  (slower, but functional) otherwise.
- **Models (shipped defaults):** embeddings = `onnx-community/embeddinggemma-300m-ONNX`
  (768-d), voice = `onnx-community/whisper-small`.
- **`/ml-selftest`** is a diagnostics page for the on-device runtime.

Power-user overrides (per-browser, via `localStorage`; no server config):

| Key                     | Default                                                 | Purpose                                                           |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `driftnote_embed_model` | `onnx-community/embeddinggemma-300m-ONNX`               | Switch the embedding model (changing it triggers a full reindex). |
| `driftnote_voice_model` | `onnx-community/whisper-small`                          | Switch the Whisper model tier.                                    |
| `driftnote_voice_dtype` | `{ encoder_model: "fp16", decoder_model_merged: "q4" }` | Quantization recipe; a bare string (e.g. `q8`) or a JSON object.  |
| `driftnote_voice_lang`  | `auto`                                                  | Default transcription language (`auto` / `english` / `german`).   |

## MCP server & OAuth

DriftNote exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server so MCP clients can query a user's notes. It is wired through Better
Auth's `mcp` plugin (`src/lib/auth.ts`) and served from
`src/pages/api/mcp/[...path].ts`.

- **Endpoint:** `/api/mcp`, gated by an OAuth bearer token (`withMcpAuth`) — not
  the session cookie.
- **Discovery metadata:** `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource`.
- **Consent page:** `/mcp/consent`. **PKCE is required.**
- **Resource identifier:** `${BETTER_AUTH_URL}/api/mcp`. `BETTER_AUTH_URL` must
  be the real public origin or OAuth discovery and token audiences break.
- **Tools** (all rate-limited and scoped to the signed-in user):
  `get_notes`, `get_notes_by_tag`, `search_notes`, `get_tags`.
- The MCP Inspector (`http://localhost:6274`) is a trusted origin **in dev
  only**; production has no trusted cross-origins.

See [Security notes](#security-notes) for the Dynamic Client Registration and
CORS posture before exposing this publicly.

## Security notes

Each item states the posture **and** its mitigation. None of these are knobs to
relax for convenience.

- **Open Dynamic Client Registration.** `allowDynamicClientRegistration: true`
  means any client can self-register an OAuth client. Access is still gated by
  user sign-in, the consent screen, and PKCE, and every MCP tool is user-scoped
  and rate-limited. If you do not intend to expose MCP publicly, keep `/api/mcp`
  and `/.well-known/*` behind your network boundary or an auth-aware proxy.
  (There is a code TODO to narrow this.)
- **`Access-Control-Allow-Origin: *` on `/api/mcp`.** MCP clients are
  cross-origin by design (Inspector, desktop clients, future browser clients).
  CORS grants nothing without a valid bearer token, so the wildcard does not
  weaken access control. (Code TODO to narrow to an allow-list once the prod
  client set is known.)
- **Auth bypass is double-gated.** `DRIFTNOTE_AUTH_BYPASS=1` only takes effect
  when `BETTER_AUTH_URL` points at localhost. A real deployment sets
  `BETTER_AUTH_URL` to its public domain, so a leaked flag cannot disable auth
  there. Still: **never set this flag in any environment with a public
  `BETTER_AUTH_URL`.** It is a local-dev convenience only.
- **Model weights come from third-party CDNs.** AI features fetch weights from
  the HF hub and jsDelivr at runtime. Air-gapped or strict supply-chain
  deployments will not get AI features without allowing those origins (there is
  a code TODO to self-host the ONNX Runtime WASM).

## Rate limiting & audit logging

In-process fixed-window rate limiters (`src/lib/ratelimit.ts`) gate the REST and
MCP surface per user: **120 reads / 10s** and **30 writes / 10s**. Over-limit
requests get a `429` with a `Retry-After` header; the client embedding indexer
paces its uploads and honors that header. Security-relevant events (sign-up,
unauthorized access, cross-origin blocks, rate limits, data export, MCP token
expiry) are written to an audit log via `src/lib/audit.ts`.
