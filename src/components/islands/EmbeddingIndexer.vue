<script setup lang="ts">
// Always-on, headless island that keeps note embeddings current on-device.
//
// It is deliberately decoupled from the Composer: capturing a note must never
// block on a model download. Instead, on mount and on every `streamchanged`
// event (new note, edit, tag rename/delete body rewrites, color changes), it
// asks the server which of the user's notes still need (re)embedding for the
// active model, embeds each in the shared Web Worker, and uploads the vector.
//
// Staleness is decided server-side (missing row / different model / different
// content hash), so this island stays simple: fetch pending → embed → PUT.
// ML imports are dynamic so the module is SSR-safe.
import { onMounted, onUnmounted, ref } from "vue";
import { subscribeStreamChanged } from "@/lib/url-state";
import { embedModel, docInput } from "@/lib/embed-model";
import { contentHash } from "@/lib/content-hash";

type PendingNote = { id: string; body: string };
type Embedder = (text: string) => Promise<number[]>;

const indexed = ref(0);
const failed = ref(false);

// Guards against overlapping sweeps: a streamchanged during a running sweep
// just flags a rerun instead of starting a second concurrent pass.
let running = false;
let rerun = false;
let embedder: Embedder | null = null;

// Load the active model once (cached in the worker) and return a function that
// turns a note body into its normalized document vector. Lazily built on first
// sweep so importing this island costs nothing until there's work to do.
async function getEmbedder(): Promise<Embedder> {
  if (embedder) return embedder;
  const { loadModel, runModel } = await import("@/lib/ml/runtime");
  const { key } = await loadModel({
    task: "feature-extraction",
    model: embedModel(),
    dtype: "q8",
  });
  embedder = async (text: string) => {
    const out = await runModel(key, docInput(text), {
      pooling: "mean",
      normalize: true,
    });
    const data = (out as { data?: unknown }).data;
    return Array.isArray(data) && Array.isArray(data[0])
      ? (data[0] as number[])
      : (data as number[]);
  };
  return embedder;
}

function toBase64(vector: number[]): string {
  const floats = Float32Array.from(vector);
  const bytes = new Uint8Array(floats.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function fetchPending(model: string): Promise<PendingNote[]> {
  const res = await fetch(
    `/api/embeddings/pending?model=${encodeURIComponent(model)}`,
  );
  if (!res.ok) throw new Error(`pending failed: ${res.status}`);
  const json = (await res.json()) as { pending: PendingNote[] };
  return json.pending;
}

async function uploadEmbedding(
  note: PendingNote,
  model: string,
  vector: number[],
): Promise<void> {
  const res = await fetch(`/api/ideas/${note.id}/embedding`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      dim: vector.length,
      vector: toBase64(vector),
      contentHash: contentHash(note.body),
    }),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

async function embedNote(
  embed: Embedder,
  note: PendingNote,
  model: string,
): Promise<void> {
  const vector = await embed(note.body);
  await uploadEmbedding(note, model, vector);
  indexed.value += 1;
}

// One sweep: drain every pending batch (the endpoint caps each at 50) until the
// list is empty, embedding and uploading each note in turn.
async function sweepOnce(): Promise<void> {
  const model = embedModel();
  const embed = await getEmbedder();
  for (;;) {
    const pending = await fetchPending(model);
    if (pending.length === 0) return;
    for (const note of pending) await embedNote(embed, note, model);
  }
}

// Serialize sweeps: while one runs, a triggering event only sets `rerun`, and
// we loop once more after it finishes so the latest changes are picked up.
async function runSweep(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      await sweepOnce();
    } while (rerun);
    failed.value = false;
  } catch (err) {
    failed.value = true;
    console.error("embedding sweep failed", err);
  } finally {
    running = false;
  }
}

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  unsubscribe = subscribeStreamChanged(() => void runSweep());
  void runSweep();
});

onUnmounted(() => unsubscribe?.());
</script>

<template>
  <span
    data-testid="embedding-indexer"
    :data-indexed="indexed"
    :data-failed="failed ? '1' : '0'"
    hidden
  ></span>
</template>
