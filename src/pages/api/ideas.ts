import type { APIRoute } from "astro";
import { createIdeaWithTags } from "@/lib/ideas";
import { parseCreateIdeaBody } from "@/lib/validation";
import { gateWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const gate = gateWrite(locals.user, "POST /api/ideas");
  if (!gate.ok) return gate.res;

  const parsed = await parseCreateIdeaBody(request);
  if (!parsed.ok) return parsed.res;

  const idea = await createIdeaWithTags({
    userId: gate.user.id,
    body: parsed.value.text,
    source: parsed.value.source,
  });
  audit("idea_create", { userId: gate.user.id, ideaId: idea.id });
  return Response.json({ idea });
};
