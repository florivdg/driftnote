import { defineMiddleware } from "astro:middleware";
import type { APIContext } from "astro";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

// OAuth + MCP endpoints are cross-origin by spec (token, register, MCP RPC).
// /api/mcp gates itself via withMcpAuth (OAuth bearer token), not the session
// cookie, so CSRF doesn't apply there either.
// TODO: add Origin allow-list for DNS-rebinding on /api/mcp once non-localhost.
const CROSS_ORIGIN_APIS = [/^\/api\/auth(\/|$)/, /^\/api\/mcp(\/|$)/];

const PUBLIC = [
  /^\/login$/,
  ...CROSS_ORIGIN_APIS,
  /^\/\.well-known\//,
  /^\/_astro\//,
  /^\/favicon/,
];

const CSRF_EXEMPT = CROSS_ORIGIN_APIS;

const FORM_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const IS_PROD = import.meta.env.PROD;

function isPublic(path: string): boolean {
  return PUBLIC.some((re) => re.test(path));
}

function isFormLike(contentType: string | null): boolean {
  if (!contentType) return true;
  const ct = contentType.toLowerCase();
  return FORM_CONTENT_TYPES.some((t) => ct.includes(t));
}

function crossOriginBlocked(ctx: APIContext): boolean {
  if (SAFE_METHODS.has(ctx.request.method)) return false;
  if (CSRF_EXEMPT.some((re) => re.test(ctx.url.pathname))) return false;
  if (!isFormLike(ctx.request.headers.get("content-type"))) return false;
  return ctx.request.headers.get("origin") !== ctx.url.origin;
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
  if (crossOriginBlocked(ctx)) {
    audit("cross_origin_blocked", {
      path: ctx.url.pathname,
      origin: ctx.request.headers.get("origin"),
      ip: clientIp(ctx.request),
    });
    return new Response(
      `Cross-site ${ctx.request.method} form submissions are forbidden`,
      { status: 403 },
    );
  }
  await attachSession(ctx);
  const early = resolveAuthResponse(ctx, !!ctx.locals.user);
  const res = early ?? (await next());
  applySecurityHeaders(res);
  return res;
});
