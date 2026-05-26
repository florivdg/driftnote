import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import { parseHueBody } from "@/lib/validation";
import { checkRate, rateLimitedResponse, writeBucket } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

type Ctx = { userId: string; tagName: string };

function requireTagContext(
  locals: App.Locals,
  params: { name?: string },
): Ctx | Response {
  if (!locals.user) return new Response("Unauthorized", { status: 401 });
  const tagName = (params.name ?? "").toLowerCase();
  if (!tagName) return new Response("Tag name required", { status: 400 });
  return { userId: locals.user.id, tagName };
}

async function updateTagHue(userId: string, name: string, hue: number) {
  const result = await db
    .update(tags)
    .set({ hue })
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .returning();
  return result[0] ?? null;
}

function gateWrite(userId: string): Response | null {
  const gate = checkRate(writeBucket, userId);
  if (gate.ok) return null;
  audit("rate_limited", { userId, route: "PATCH /api/tags/[name]" });
  return rateLimitedResponse(gate.retryAfter);
}

async function applyHueUpdate(ctx: Ctx, request: Request): Promise<Response> {
  const parsed = await parseHueBody(request);
  if (!parsed.ok) return parsed.res;
  const tag = await updateTagHue(ctx.userId, ctx.tagName, parsed.value);
  if (!tag) return new Response("Tag not found", { status: 404 });
  audit("tag_update", {
    userId: ctx.userId,
    name: ctx.tagName,
    hue: parsed.value,
  });
  return Response.json({ tag });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const ctx = requireTagContext(locals, params);
  if (ctx instanceof Response) return ctx;
  return gateWrite(ctx.userId) ?? applyHueUpdate(ctx, request);
};
