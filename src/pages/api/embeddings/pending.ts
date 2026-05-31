import type { APIRoute } from "astro";
import { pendingForModel } from "@/lib/embeddings";
import { gateRead } from "@/lib/ratelimit";

// Cap how many notes a single sweep returns so a fresh instance backfills in
// bounded batches; the client polls again until the list drains.
const SWEEP_LIMIT = 50;

// Notes the client still needs to (re)embed for `model`: missing rows or stale
// content hashes. The model is required — staleness is defined per model, so an
// absent param can't be meaningfully answered.
export const prerender = false;

export const GET: APIRoute = ({ url, locals }) => {
  const gate = gateRead(locals.user, "GET /api/embeddings/pending");
  if (!gate.ok) return gate.res;
  const model = url.searchParams.get("model")?.trim();
  if (!model) return new Response("model required", { status: 400 });
  const pending = pendingForModel(gate.user.id, model, SWEEP_LIMIT);
  return Response.json({ pending });
};
