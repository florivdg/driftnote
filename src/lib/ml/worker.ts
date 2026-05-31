/// <reference lib="webworker" />
// On-device model worker. All heavy lifting — model download + WebGPU/WASM
// inference via Transformers.js — runs here so the UI thread stays responsive.
// Pipelines are cached per task+model+device, so a second `run` reuses the
// already-downloaded weights. This is the shared runtime for the voice (#24)
// and embeddings (#25) features; each just loads its own model.
import { pipeline, env } from "@huggingface/transformers";

// Fetch model weights from the HF hub; we don't bundle local model files.
env.allowLocalModels = false;
// Single-threaded WASM avoids SharedArrayBuffer, so the app needs no COOP/COEP
// cross-origin-isolation headers. WebGPU is the fast path; WASM is the fallback.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

type LoadMessage = {
  id: number;
  kind: "load";
  task: string;
  model: string;
  device: "webgpu" | "wasm";
  dtype?: string | Record<string, string>;
};
type RunMessage = {
  id: number;
  kind: "run";
  key: string;
  input: unknown;
  options?: Record<string, unknown>;
};
type InboundMessage = LoadMessage | RunMessage;

type Pipe = (
  input: unknown,
  options?: Record<string, unknown>,
) => Promise<unknown>;

const pipelines = new Map<string, Promise<Pipe>>();

function post(message: unknown): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

async function ensurePipeline(msg: LoadMessage): Promise<string> {
  const key = `${msg.task}::${msg.model}::${msg.device}`;
  if (!pipelines.has(key)) {
    // Set the entry before awaiting so concurrent loads of the same model dedupe.
    const p = pipeline(msg.task as never, msg.model, {
      device: msg.device,
      dtype: msg.dtype as never,
      progress_callback: (info: unknown) =>
        post({ id: msg.id, kind: "progress", info }),
    }).catch((err: unknown) => {
      // Evict a failed load so the caller can retry (e.g. WebGPU → WASM).
      pipelines.delete(key);
      throw err;
    }) as Promise<Pipe>;
    pipelines.set(key, p);
  }
  await pipelines.get(key);
  return key;
}

// Tensors (feature-extraction) carry methods that don't survive postMessage,
// so flatten them to a plain { dims, data } before sending.
function serialize(result: unknown): unknown {
  if (result && typeof (result as { tolist?: unknown }).tolist === "function") {
    const tensor = result as { dims: number[]; tolist: () => unknown };
    return { dims: tensor.dims, data: tensor.tolist() };
  }
  return result;
}

async function handleLoad(msg: LoadMessage): Promise<void> {
  const key = await ensurePipeline(msg);
  post({ id: msg.id, kind: "loaded", key });
}

async function handleRun(msg: RunMessage): Promise<void> {
  const pipe = await pipelines.get(msg.key);
  if (!pipe) throw new Error(`model not loaded: ${msg.key}`);
  const result = await pipe(msg.input, msg.options ?? {});
  post({ id: msg.id, kind: "done", result: serialize(result) });
}

self.onmessage = async (event: MessageEvent<InboundMessage>): Promise<void> => {
  const msg = event.data;
  try {
    if (msg.kind === "load") await handleLoad(msg);
    else await handleRun(msg);
  } catch (err) {
    post({
      id: msg.id,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
