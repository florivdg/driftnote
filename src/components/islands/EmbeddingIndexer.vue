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

// The server write gate allows 30 PUTs / 10s. Space uploads at least this far
// apart (10s / 30 + margin) so a fast WebGPU backfill of many notes never trips
// the limit; on a slow CPU the embed step already paces us, so this is a no-op.
const MIN_UPLOAD_SPACING_MS = 380;
// Fallback backoff if a 429 ever slips through without a usable Retry-After.
const DEFAULT_BACKOFF_MS = 11_000;
const MAX_UPLOAD_RETRIES = 5;

const indexed = ref(0);
const failed = ref(false);

// Guards against overlapping sweeps: a streamchanged during a running sweep
// just flags a rerun instead of starting a second concurrent pass.
let running = false;
let rerun = false;
let embedder: Embedder | null = null;
// Timestamp of the last upload, so we can space the next one out.
let lastUploadAt = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Block until at least MIN_UPLOAD_SPACING_MS has elapsed since the previous
// upload, keeping the sustained PUT rate under the server's write gate.
async function pace(): Promise<void> {
  const wait = lastUploadAt + MIN_UPLOAD_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastUploadAt = Date.now();
}

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

function uploadBody(
  note: PendingNote,
  model: string,
  vector: number[],
): string {
  return JSON.stringify({
    model,
    dim: vector.length,
    vector: toBase64(vector),
    contentHash: contentHash(note.body),
  });
}

// Honor the server's `retry-after` (seconds) on a 429, falling back to a fixed
// window so the next attempt lands in a fresh rate-limit bucket.
function backoffMs(res: Response): number {
  const header = Number(res.headers.get("retry-after"));
  return Number.isFinite(header) && header > 0
    ? header * 1000 + 250
    : DEFAULT_BACKOFF_MS;
}

// PUT one vector, paced under the write gate. A 429 isn't fatal: wait out the
// limiter (Retry-After) and retry the same note, up to a bounded number of
// times, so a fresh-vault backfill of >30 notes drains instead of stalling.
async function uploadEmbedding(
  note: PendingNote,
  model: string,
  vector: number[],
): Promise<void> {
  const payload = uploadBody(note, model, vector);
  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    await pace();
    const res = await fetch(`/api/ideas/${note.id}/embedding`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    if (res.ok) return;
    if (res.status !== 429) throw new Error(`upload failed: ${res.status}`);
    await sleep(backoffMs(res));
  }
  throw new Error(`upload failed: 429 after ${MAX_UPLOAD_RETRIES} retries`);
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
