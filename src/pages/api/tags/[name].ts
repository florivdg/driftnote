import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import { parseTagPatchBody } from "@/lib/validation";
import { deleteTag, renameOrMergeTag, type TagRow } from "@/lib/ideas";
import { gateWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function updateTagHue(
  userId: string,
  name: string,
  hue: number,
): Promise<TagRow | null> {
  const result = await db
    .update(tags)
    .set({ hue })
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .returning();
  return result[0] ?? null;
}

type RenameStep =
  | { ok: true; tag: TagRow | null; name: string; merged: boolean }
  | { ok: false; res: Response };

async function applyRename(
  userId: string,
  tagName: string,
  newName: string | undefined,
): Promise<RenameStep> {
  if (newName === undefined) {
    return { ok: true, tag: null, name: tagName, merged: false };
  }
  const result = await renameOrMergeTag(userId, tagName, newName);
  if (!result) {
    return { ok: false, res: new Response("Tag not found", { status: 404 }) };
  }
  audit("tag_rename", {
    userId,
    from: tagName,
    to: result.tag.name,
    merged: result.merged,
  });
  return {
    ok: true,
    tag: result.tag,
    name: result.tag.name,
    merged: result.merged,
  };
}

async function applyHue(
  userId: string,
  name: string,
  hue: number | undefined,
  prior: { tag: TagRow | null; merged: boolean },
): Promise<Response> {
  if (hue === undefined) {
    return Response.json({ tag: prior.tag, merged: prior.merged });
  }
  const tag = await updateTagHue(userId, name, hue);
  if (!tag) return new Response("Tag not found", { status: 404 });
  audit("tag_update", { userId, name, hue });
  return Response.json({ tag, merged: prior.merged });
}

async function applyTagPatch(
  userId: string,
  tagName: string,
  request: Request,
): Promise<Response> {
  const parsed = await parseTagPatchBody(request);
  if (!parsed.ok) return parsed.res;
  const renamed = await applyRename(userId, tagName, parsed.value.newName);
  if (!renamed.ok) return renamed.res;
  return applyHue(userId, renamed.name, parsed.value.hue, renamed);
}

async function applyTagDelete(
  userId: string,
  tagName: string,
): Promise<Response> {
  const deleted = await deleteTag(userId, tagName);
  if (!deleted) return new Response("Tag not found", { status: 404 });
  audit("tag_delete", { userId, name: tagName });
  return new Response(null, { status: 204 });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const gate = gateWrite(locals.user, "PATCH /api/tags/[name]");
  if (!gate.ok) return gate.res;
  const name = (params.name ?? "").toLowerCase();
  if (!name) return new Response("Tag name required", { status: 400 });
  return applyTagPatch(gate.user.id, name, request);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const gate = gateWrite(locals.user, "DELETE /api/tags/[name]");
  if (!gate.ok) return gate.res;
  const name = (params.name ?? "").toLowerCase();
  if (!name) return new Response("Tag name required", { status: 400 });
  return applyTagDelete(gate.user.id, name);
};
