import type { APIRoute } from "astro";
import { createIdeaWithTags } from "@/lib/ideas";
import { parseCreateIdeaBody } from "@/lib/validation";
import { checkRate, rateLimitedResponse, writeBucket } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const gate = checkRate(writeBucket, user.id);
  if (!gate.ok) {
    audit("rate_limited", { userId: user.id, route: "POST /api/ideas" });
    return rateLimitedResponse(gate.retryAfter);
  }

  const parsed = await parseCreateIdeaBody(request);
  if (!parsed.ok) return parsed.res;

  const idea = await createIdeaWithTags({
    userId: user.id,
    body: parsed.value.text,
    source: parsed.value.source,
  });
  audit("idea_create", { userId: user.id, ideaId: idea.id });
  return Response.json({ idea });
};
