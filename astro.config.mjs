// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import vue from "@astrojs/vue";
import { fileURLToPath } from "node:url";

// Keep `@/*` in sync with tsconfig.json compilerOptions.paths.
// fallow-ignore-next-line unresolved-import
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [vue()],
  // CSP is build-only — `astro dev` will NOT emit the header (Vite HMR uses
  // unnonced inline scripts). Test via `bun run build && bun run start`.
  // Other security headers (X-Frame-Options, etc.) ship from src/middleware.ts.
  //
  // `checkOrigin: false` disables Astro's blanket cross-origin form-POST
  // rejection, which is incompatible with OAuth (token, register, etc. are
  // spec'd cross-origin). src/middleware.ts re-implements the same check with
  // /api/auth/* and /api/mcp/* exempted.
  security: {
    checkOrigin: false,
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src https://fonts.gstatic.com",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      styleDirective: {
        resources: ["'self'", "https://fonts.googleapis.com"],
      },
      scriptDirective: {
        // sha256 of the FOUC-killer in src/layouts/Layout.astro.
        // Recompute via `bun scripts/csp-fouc-hash.ts` whenever that script changes.
        hashes: ["sha256-or8ltn6lsi8gooSd/lFUJno4iOeNl7gkWvdmpY2sX+M="],
      },
    },
  },
  vite: {
    resolve: {
      alias: { "@": srcPath },
    },
  },
});
