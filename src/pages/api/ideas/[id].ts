import type { APIRoute } from "astro";
import { deleteIdea, updateIdeaWithTags } from "@/lib/ideas";
import { parseUpdateIdeaBody } from "@/lib/validation";
import { gateWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

async function applyIdeaUpdate(
  userId: string,
  ideaId: string,
  request: Request,
): Promise<Response> {
  const parsed = await parseUpdateIdeaBody(request);
  if (!parsed.ok) return parsed.res;
  const idea = await updateIdeaWithTags({
    userId,
    ideaId,
    body: parsed.value.text,
  });
  if (!idea) return new Response("Idea not found", { status: 404 });
  audit("idea_update", { userId, ideaId });
  return Response.json({ idea });
}

async function applyIdeaDelete(
  userId: string,
  ideaId: string,
): Promise<Response> {
  const deleted = await deleteIdea(userId, ideaId);
  if (!deleted) return new Response("Idea not found", { status: 404 });
  audit("idea_delete", { userId, ideaId });
  return new Response(null, { status: 204 });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const gate = gateWrite(locals.user, "PATCH /api/ideas/[id]");
  if (!gate.ok) return gate.res;
  const ideaId = params.id ?? "";
  if (!ideaId) return new Response("Idea id required", { status: 400 });
  return applyIdeaUpdate(gate.user.id, ideaId, request);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const gate = gateWrite(locals.user, "DELETE /api/ideas/[id]");
  if (!gate.ok) return gate.res;
  const ideaId = params.id ?? "";
  if (!ideaId) return new Response("Idea id required", { status: 400 });
  return applyIdeaDelete(gate.user.id, ideaId);
};
