import type { APIRoute } from "astro";
import {
  countArchived,
  countIdeas,
  countTextOnly,
  countUntagged,
  countVoice,
  listTagsWithCounts,
} from "@/lib/ideas";
import { gateRead } from "@/lib/ratelimit";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const gate = gateRead(locals.user, "GET /api/tags");
  if (!gate.ok) return gate.res;

  const userId = gate.user.id;
  const tagList = await listTagsWithCounts(userId);

  return Response.json({
    tagList,
    totalIdeas: countIdeas(userId),
    untaggedCount: countUntagged(userId),
    voiceCount: countVoice(userId),
    textCount: countTextOnly(userId),
    archivedCount: countArchived(userId),
  });
};
