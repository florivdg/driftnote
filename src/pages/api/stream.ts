import type { APIRoute } from "astro";
import { listIdeas, type StreamFilters } from "@/lib/ideas";
import { parseTags } from "@/lib/url";
import { parseSourceParam } from "@/lib/validation";
import { gateRead } from "@/lib/ratelimit";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const gate = gateRead(locals.user, "GET /api/stream");
  if (!gate.ok) return gate.res;

  const filters: StreamFilters = {
    q: url.searchParams.get("q") ?? undefined,
    tags: parseTags(url.searchParams.get("tags")),
    untagged: url.searchParams.get("untagged") === "1",
    source: parseSourceParam(url.searchParams.get("source")),
  };

  const ideas = await listIdeas(gate.user.id, filters);
  return Response.json({ ideas });
};
