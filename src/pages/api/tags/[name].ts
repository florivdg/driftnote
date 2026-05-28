import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import { parseHueBody } from "@/lib/validation";
import { gateWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function updateTagHue(userId: string, name: string, hue: number) {
  const result = await db
    .update(tags)
    .set({ hue })
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .returning();
  return result[0] ?? null;
}

async function applyHueUpdate(
  userId: string,
  name: string,
  request: Request,
): Promise<Response> {
  const parsed = await parseHueBody(request);
  if (!parsed.ok) return parsed.res;
  const tag = await updateTagHue(userId, name, parsed.value);
  if (!tag) return new Response("Tag not found", { status: 404 });
  audit("tag_update", { userId, name, hue: parsed.value });
  return Response.json({ tag });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const gate = gateWrite(locals.user, "PATCH /api/tags/[name]");
  if (!gate.ok) return gate.res;
  const name = (params.name ?? "").toLowerCase();
  if (!name) return new Response("Tag name required", { status: 400 });
  return applyHueUpdate(gate.user.id, name, request);
};
