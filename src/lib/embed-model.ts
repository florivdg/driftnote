// Embedding-model contract shared by the client indexer and the SSR consumer.
//
// The model id is part of the index contract: a stored vector is only ever
// compared against others from the SAME model (see src/lib/embeddings.ts), and
// changing the model triggers a full reindex via the backfill sweep. The
// default is overridable through localStorage so an operator can switch to a
// lighter model (and tests can pin a small one) without a code change.

// Google's EmbeddingGemma — purpose-built for on-device, strong EN+DE, 768-d.
export const DEFAULT_EMBED_MODEL = "onnx-community/embeddinggemma-300m-ONNX";

const MODEL_STORAGE_KEY = "driftnote_embed_model";

// Resolve the active model: localStorage override (if a non-empty string) else
// the shipped default. Guarded for SSR where `localStorage` doesn't exist.
export function embedModel(): string {
  if (typeof localStorage === "undefined") return DEFAULT_EMBED_MODEL;
  const stored = localStorage.getItem(MODEL_STORAGE_KEY);
  return stored && stored.trim() ? stored : DEFAULT_EMBED_MODEL;
}

// EmbeddingGemma's document prefix for stored notes. The query side (semantic
// search, a follow-up) would use `task: search result | query: ` instead.
export function docInput(body: string): string {
  return `title: none | text: ${body}`;
}
