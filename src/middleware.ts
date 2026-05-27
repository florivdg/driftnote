import { defineMiddleware } from "astro:middleware";
import type { APIContext } from "astro";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

const PUBLIC = [
  /^\/login$/,
  /^\/api\/auth(\/|$)/,
  // /api/mcp gates itself via withMcpAuth (OAuth bearer token), not the session
  // cookie. TODO: add Origin allow-list for DNS-rebinding once non-localhost.
  /^\/api\/mcp(\/|$)/,
  /^\/\.well-known\//,
  /^\/_astro\//,
  /^\/favicon/,
];

const IS_PROD = import.meta.env.PROD;

function isPublic(path: string): boolean {
  return PUBLIC.some((re) => re.test(path));
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "";
}

function unauthResponse(ctx: APIContext, path: string): Response {
  audit("unauth", { path, ip: clientIp(ctx.request) });
  if (path.startsWith("/api/")) {
    return new Response("Unauthorized", { status: 401 });
  }
  return ctx.redirect(`/login?next=${encodeURIComponent(path)}`);
}

function resolveAuthResponse(
  ctx: APIContext,
  hasUser: boolean,
): Response | null {
  const path = ctx.url.pathname;
  if (!hasUser) return isPublic(path) ? null : unauthResponse(ctx, path);
  if (path === "/login") return ctx.redirect("/");
  return null;
}

async function attachSession(ctx: APIContext): Promise<void> {
  const result = await auth.api.getSession({ headers: ctx.request.headers });
  ctx.locals.user = result ? result.user : null;
  ctx.locals.session = result ? result.session : null;
}

// CSP is handled by Astro's built-in `security.csp` (see astro.config.mjs).
// It auto-hashes framework scripts and we provide the FOUC-killer hash, so the
// resulting `script-src` has no `'unsafe-inline'`. Astro injects the header on
// HTML/SSR routes only; API JSON responses don't render scripts, so they
// intentionally have no CSP. X-Frame-Options below still protects against
// clickjacking in both dev and prod.
function applySecurityHeaders(res: Response): void {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  if (IS_PROD) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
  }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  await attachSession(ctx);
  const early = resolveAuthResponse(ctx, !!ctx.locals.user);
  const res = early ?? (await next());
  applySecurityHeaders(res);
  return res;
});
