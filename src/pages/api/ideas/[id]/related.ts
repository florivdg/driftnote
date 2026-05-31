import type { APIRoute } from "astro";
import { relatedFor } from "@/lib/embeddings";
import { parsePositiveInt } from "@/lib/validation";
import { gateRead } from "@/lib/ratelimit";

const DEFAULT_K = 5;
const MAX_K = 20;

// Brute-force cosine KNN from the note's stored vector vs the user's other
// same-model vectors. Owner-scoped inside relatedFor; returns [] when the note
// has no embedding yet (not an error — the client just renders nothing).
export const prerender = false;

export const GET: APIRoute = ({ params, url, locals }) => {
  const gate = gateRead(locals.user, "GET /api/ideas/[id]/related");
  if (!gate.ok) return gate.res;
  const ideaId = params.id ?? "";
  if (!ideaId) return new Response("Idea id required", { status: 400 });
  const k = parsePositiveInt(url.searchParams.get("k"), DEFAULT_K, MAX_K);
  const related = relatedFor(gate.user.id, ideaId, k);
  return Response.json({ related });
};
