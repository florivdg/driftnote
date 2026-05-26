import { defineMiddleware } from "astro:middleware";
import type { APIContext } from "astro";
import { auth } from "@/lib/auth";

const PUBLIC = [/^\/login$/, /^\/api\/auth(\/|$)/, /^\/_astro\//, /^\/favicon/];

function isPublic(path: string): boolean {
  return PUBLIC.some((re) => re.test(path));
}

function unauthResponse(ctx: APIContext, path: string): Response {
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

export const onRequest = defineMiddleware(async (ctx, next) => {
  await attachSession(ctx);
  return resolveAuthResponse(ctx, !!ctx.locals.user) ?? next();
});
