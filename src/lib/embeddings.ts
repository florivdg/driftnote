// On-device note embeddings: storage + brute-force cosine KNN over bun:sqlite.
//
// Vectors are L2-normalized Float32, persisted as raw little-endian bytes in a
// BLOB. Because they're normalized, cosine similarity reduces to a plain dot
// product. KNN only ever compares vectors of the SAME model (the `model` column
// pins the index contract); a model change leaves old rows stale until the
// client backfill re-embeds them.
//
// Staleness is detected server-side: a note needs (re)embedding when it has no
// row for the current model, or its stored `contentHash` differs from a fresh
// hash of the body. That single signal covers new notes, edits, and the bulk
// body rewrites that tag rename/delete perform on the server.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ideas, ideaEmbedding } from "@/lib/db/schema";
import { contentHash } from "@/lib/content-hash";

export type PendingNote = { id: string; body: string };
export type RelatedNote = { id: string; score: number };
export type RelatedCard = { id: string; body: string; score: number };

// Read a BLOB back as a Float32Array. Copies into a fresh aligned buffer so a
// non-8-byte-aligned slice from SQLite can't break the typed-array view.
export function decodeVector(blob: Buffer | Uint8Array): Float32Array {
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer, 0, blob.byteLength / 4);
}

// Dot product of two equal-length, L2-normalized vectors == cosine similarity.
function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Insert or replace the embedding for one note. Caller has already verified the
// note is owned by the user, so this is keyed on ideaId alone.
export function upsertEmbedding(opts: {
  ideaId: string;
  model: string;
  dim: number;
  vector: Buffer;
  hash: string;
}): void {
  db.insert(ideaEmbedding)
    .values({
      ideaId: opts.ideaId,
      model: opts.model,
      dim: opts.dim,
      vector: opts.vector,
      contentHash: opts.hash,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: ideaEmbedding.ideaId,
      set: {
        model: opts.model,
        dim: opts.dim,
        vector: opts.vector,
        contentHash: opts.hash,
        createdAt: Date.now(),
      },
    })
    .run();
}

// True when the note exists and belongs to the user.
export function ownsIdea(userId: string, ideaId: string): boolean {
  const row = db
    .select({ id: ideas.id })
    .from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.userId, userId)))
    .get();
  return row !== undefined;
}

// True when a candidate row is missing its current-model vector or its stored
// hash no longer matches the body — i.e. the note needs (re)embedding.
function isStale(row: { body: string; storedHash: string | null }): boolean {
  return row.storedHash === null || row.storedHash !== contentHash(row.body);
}

// Notes that need (re)embedding for `model`: no row for this model, or a stale
// content hash. The LEFT JOIN scopes the join to the current model in SQL; the
// per-row hash comparison happens in JS (one FNV pass per candidate). Capped so
// a fresh instance backfills in bounded sweeps rather than one giant batch.
export function pendingForModel(
  userId: string,
  model: string,
  limit: number,
): PendingNote[] {
  const rows = db
    .select({
      id: ideas.id,
      body: ideas.body,
      storedHash: ideaEmbedding.contentHash,
    })
    .from(ideas)
    .leftJoin(
      ideaEmbedding,
      and(eq(ideaEmbedding.ideaId, ideas.id), eq(ideaEmbedding.model, model)),
    )
    .where(eq(ideas.userId, userId))
    .all();
  const pending: PendingNote[] = [];
  for (const r of rows) {
    if (pending.length >= limit) break;
    if (isStale(r)) pending.push({ id: r.id, body: r.body });
  }
  return pending;
}

// Load the user's stored vectors for one model, joined to each note's CURRENT
// body so the caller can drop stale rows. A vector is fresh only when its stored
// `contentHash` still matches a fresh hash of the live body; a row left stale by
// an edit or a server-side tag-rewrite is excluded so KNN never ranks from an
// outdated vector (the indexer re-embeds it on its next sweep). The target note
// is filtered out by the caller so it can't be its own top result.
function loadFreshVectors(
  userId: string,
  model: string,
): { id: string; vector: Float32Array }[] {
  const rows = db
    .select({
      id: ideaEmbedding.ideaId,
      vector: ideaEmbedding.vector,
      storedHash: ideaEmbedding.contentHash,
      body: ideas.body,
    })
    .from(ideaEmbedding)
    .innerJoin(ideas, eq(ideas.id, ideaEmbedding.ideaId))
    .where(and(eq(ideas.userId, userId), eq(ideaEmbedding.model, model)))
    .all();
  return rows
    .filter((r) => r.storedHash === contentHash(r.body))
    .map((r) => ({ id: r.id, vector: decodeVector(r.vector as Buffer) }));
}

// Brute-force cosine KNN: load the target note's stored vector, score every
// other FRESH same-model vector by dot product (== cosine, since all are
// normalized), and return the top-k by score. Returns [] when the target has no
// embedding yet OR its stored vector is stale (the body changed since it was
// embedded), so callers never rank from an outdated vector and render an empty
// "related" list until the indexer catches up.
export function relatedFor(
  userId: string,
  ideaId: string,
  k: number,
): RelatedNote[] {
  const target = db
    .select({
      vector: ideaEmbedding.vector,
      model: ideaEmbedding.model,
      storedHash: ideaEmbedding.contentHash,
      body: ideas.body,
    })
    .from(ideaEmbedding)
    .innerJoin(ideas, eq(ideas.id, ideaEmbedding.ideaId))
    .where(and(eq(ideas.userId, userId), eq(ideaEmbedding.ideaId, ideaId)))
    .get();
  if (!target || target.storedHash !== contentHash(target.body)) return [];
  const query = decodeVector(target.vector as Buffer);
  const scored = loadFreshVectors(userId, target.model)
    .filter((row) => row.id !== ideaId && row.vector.length === query.length)
    .map((row) => ({ id: row.id, score: dot(query, row.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// Resolve a ranked id list to renderable cards (id + body) in score order.
// One batched SELECT for the bodies, then re-ordered to match the ranking
// (SQL row order isn't guaranteed). Owner-scoped via `relatedFor` upstream.
function attachBodies(userId: string, ranked: RelatedNote[]): RelatedCard[] {
  if (ranked.length === 0) return [];
  const ids = ranked.map((r) => r.id);
  const rows = db
    .select({ id: ideas.id, body: ideas.body })
    .from(ideas)
    .where(and(eq(ideas.userId, userId), inArray(ideas.id, ids)))
    .all();
  const bodyById = new Map(rows.map((r) => [r.id, r.body]));
  return ranked
    .filter((r) => bodyById.has(r.id))
    .map((r) => ({
      id: r.id,
      body: bodyById.get(r.id) as string,
      score: r.score,
    }));
}

// Server-side "related notes" for the permalink: brute-force KNN, then hydrate
// the winners with their bodies for rendering. No browser model needed — the
// stored vectors live here. Returns [] gracefully when the note isn't embedded.
export function relatedCards(
  userId: string,
  ideaId: string,
  k: number,
): RelatedCard[] {
  return attachBodies(userId, relatedFor(userId, ideaId, k));
}
