// Main-thread client for the on-device model worker (src/lib/ml/worker.ts).
// Lazily constructs the worker on first use, so importing this module is safe
// during SSR — no `Worker` is created until a browser actually calls loadModel.
// Shared by the voice (#24) and embeddings (#25) islands.

export type ModelSpec = {
  task: string;
  model: string;
  dtype?: string | Record<string, string>;
  device?: "webgpu" | "wasm";
};

export type ProgressInfo = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type WorkerReply = { id: number; kind: string; [key: string]: unknown };

type Pending = {
  resolve: (value: WorkerReply) => void;
  reject: (reason: Error) => void;
  onProgress?: (info: ProgressInfo) => void;
};

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function settle(entry: Pending, msg: WorkerReply): void {
  pending.delete(msg.id);
  if (msg.kind === "error") entry.reject(new Error(String(msg.message)));
  else entry.resolve(msg);
}

function handleMessage(event: MessageEvent<WorkerReply>): void {
  const msg = event.data;
  const entry = pending.get(msg.id);
  if (!entry) return;
  if (msg.kind === "progress") {
    entry.onProgress?.(msg.info as ProgressInfo);
    return;
  }
  settle(entry, msg);
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", handleMessage);
  }
  return worker;
}

function send(
  payload: Record<string, unknown>,
  onProgress?: (info: ProgressInfo) => void,
): Promise<WorkerReply> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ ...payload, id });
  });
}

export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function pickDevice(spec: ModelSpec): "webgpu" | "wasm" {
  return spec.device ?? (supportsWebGPU() ? "webgpu" : "wasm");
}

// Loads (and caches) a model in the worker, returning its handle. Tries WebGPU
// when available and transparently falls back to WASM if the GPU load fails.
export async function loadModel(
  spec: ModelSpec,
  onProgress?: (info: ProgressInfo) => void,
): Promise<{ key: string; device: "webgpu" | "wasm" }> {
  const device = pickDevice(spec);
  try {
    const res = await send({ kind: "load", ...spec, device }, onProgress);
    return { key: res.key as string, device };
  } catch (err) {
    if (device !== "webgpu") throw err;
    const res = await send(
      { kind: "load", ...spec, device: "wasm" },
      onProgress,
    );
    return { key: res.key as string, device: "wasm" };
  }
}

// Runs a loaded model. `input` and `options` are forwarded to the Transformers.js
// pipeline (e.g. audio for ASR, or text + { pooling, normalize } for embeddings).
export async function runModel(
  key: string,
  input: unknown,
  options?: Record<string, unknown>,
): Promise<unknown> {
  const res = await send({ kind: "run", key, input, options });
  return res.result;
}
