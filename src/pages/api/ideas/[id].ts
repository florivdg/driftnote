import type { APIRoute } from "astro";
import { deleteIdea, setIdeaState, updateIdeaWithTags } from "@/lib/ideas";
import { parseIdeaPatchBody, type IdeaPatch } from "@/lib/validation";
import { gateWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

async function applyEdit(
  userId: string,
  ideaId: string,
  text: string,
): Promise<Response> {
  const idea = await updateIdeaWithTags({ userId, ideaId, body: text });
  if (!idea) return new Response("Idea not found", { status: 404 });
  audit("idea_update", { userId, ideaId });
  return Response.json({ idea });
}

async function applyState(
  userId: string,
  ideaId: string,
  patch: { archived?: boolean; pinned?: boolean },
): Promise<Response> {
  const ok = await setIdeaState(userId, ideaId, patch);
  if (!ok) return new Response("Idea not found", { status: 404 });
  audit("idea_state", { userId, ideaId, ...patch });
  return new Response(null, { status: 204 });
}

function dispatchPatch(
  userId: string,
  ideaId: string,
  patch: IdeaPatch,
): Promise<Response> {
  return patch.kind === "edit"
    ? applyEdit(userId, ideaId, patch.text)
    : applyState(userId, ideaId, {
        archived: patch.archived,
        pinned: patch.pinned,
      });
}

async function applyIdeaPatch(
  userId: string,
  ideaId: string,
  request: Request,
): Promise<Response> {
  const parsed = await parseIdeaPatchBody(request);
  if (!parsed.ok) return parsed.res;
  return dispatchPatch(userId, ideaId, parsed.value);
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

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const gate = gateWrite(locals.user, "PATCH /api/ideas/[id]");
  if (!gate.ok) return gate.res;
  const ideaId = params.id ?? "";
  if (!ideaId) return new Response("Idea id required", { status: 400 });
  return applyIdeaPatch(gate.user.id, ideaId, request);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const gate = gateWrite(locals.user, "DELETE /api/ideas/[id]");
  if (!gate.ok) return gate.res;
  const ideaId = params.id ?? "";
  if (!ideaId) return new Response("Idea id required", { status: 400 });
  return applyIdeaDelete(gate.user.id, ideaId);
};
