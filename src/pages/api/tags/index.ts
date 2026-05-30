import type { APIRoute } from "astro";
import { countIdeas, countUntagged, listTagsWithCounts } from "@/lib/ideas";
import { gateRead } from "@/lib/ratelimit";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const gate = gateRead(locals.user, "GET /api/tags");
  if (!gate.ok) return gate.res;

  const [tagList, totalIdeas, untaggedCount] = await Promise.all([
    listTagsWithCounts(gate.user.id),
    countIdeas(gate.user.id),
    countUntagged(gate.user.id),
  ]);

  return Response.json({ tagList, totalIdeas, untaggedCount });
};
