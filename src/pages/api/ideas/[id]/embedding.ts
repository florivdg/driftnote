import type { APIRoute } from "astro";
import { ownsIdea, upsertEmbedding } from "@/lib/embeddings";
import { parseEmbeddingBody, type EmbeddingUpsert } from "@/lib/validation";
import { guardIdWrite } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

// Persist the client-computed vector for one note. Ownership is checked here
// (404 on a foreign/missing id, indistinguishable — no ownership leak), then
// the row is upserted so a re-embed (edit, tag rewrite, model change) replaces
// the previous vector in place.
async function storeEmbedding(
  userId: string,
  ideaId: string,
  body: EmbeddingUpsert,
): Promise<Response> {
  if (!ownsIdea(userId, ideaId)) {
    return new Response("Idea not found", { status: 404 });
  }
  upsertEmbedding({
    ideaId,
    model: body.model,
    dim: body.dim,
    vector: body.vector,
    hash: body.contentHash,
  });
  audit("idea_embedding", { userId, ideaId, model: body.model, dim: body.dim });
  return new Response(null, { status: 204 });
}

export const prerender = false;

export const PUT: APIRoute = ({ params, request, locals }) =>
  guardIdWrite(
    locals.user,
    params.id,
    "PUT /api/ideas/[id]/embedding",
    async (userId, ideaId) => {
      const parsed = await parseEmbeddingBody(request);
      if (!parsed.ok) return parsed.res;
      return storeEmbedding(userId, ideaId, parsed.value);
    },
  );
