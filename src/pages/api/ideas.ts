import type { APIRoute } from "astro";
import {
  createIdeaWithTags,
  listIdeas,
  listTagsWithCounts,
  type StreamFilters,
} from "@/lib/ideas";
import { parseTags } from "@/lib/url";
import { parseCreateIdeaBody, parseSourceParam } from "@/lib/validation";
import {
  checkRate,
  rateLimitedResponse,
  readBucket,
  writeBucket,
} from "@/lib/ratelimit";
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

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const gate = checkRate(readBucket, user.id);
  if (!gate.ok) {
    audit("rate_limited", { userId: user.id, route: "GET /api/ideas" });
    return rateLimitedResponse(gate.retryAfter);
  }

  const filters: StreamFilters = {
    q: url.searchParams.get("q") ?? undefined,
    tags: parseTags(url.searchParams.get("tags")),
    untagged: url.searchParams.get("untagged") === "1",
    source: parseSourceParam(url.searchParams.get("source")),
  };

  const [ideas, tagList] = await Promise.all([
    listIdeas(user.id, filters),
    listTagsWithCounts(user.id),
  ]);

  return Response.json({ ideas, tagList });
};
