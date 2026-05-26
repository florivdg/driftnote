import type { APIRoute } from "astro";
import {
  createIdeaWithTags,
  listIdeas,
  listTagsWithCounts,
  type StreamFilters,
} from "@/lib/ideas";
import { parseTags } from "@/lib/url";
import { parseCreateIdeaBody, parseSourceParam } from "@/lib/validation";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = await parseCreateIdeaBody(request);
  if (!parsed.ok) return parsed.res;

  const idea = await createIdeaWithTags({
    userId: user.id,
    body: parsed.value.text,
    source: parsed.value.source,
  });
  return Response.json({ idea });
};

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

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
