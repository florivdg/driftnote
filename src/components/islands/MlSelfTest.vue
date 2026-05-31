<script setup lang="ts">
// Diagnostic island that exercises the shared on-device model runtime end to end:
// it downloads a small embedding model and runs one inference in the browser,
// reporting the device used (webgpu/wasm), download progress, and output dims.
// Doubles as the verification surface for the runtime foundation.
import { ref } from "vue";
import type { ProgressInfo } from "@/lib/ml/runtime";

const status = ref<"idle" | "loading" | "running" | "done" | "error">("idle");
const device = ref("");
const progress = ref(0);
const dims = ref<number | null>(null);
const sample = ref("");
const errorMsg = ref("");

function readVector(out: unknown): number[] {
  const data = (out as { data?: unknown }).data;
  if (Array.isArray(data) && Array.isArray(data[0])) return data[0] as number[];
  if (Array.isArray(data)) return data as number[];
  return [];
}

async function run(): Promise<void> {
  status.value = "loading";
  errorMsg.value = "";
  progress.value = 0;
  try {
    const { loadModel, runModel } = await import("@/lib/ml/runtime");
    const { key, device: used } = await loadModel(
      {
        task: "feature-extraction",
        model: "Xenova/all-MiniLM-L6-v2",
        dtype: "q8",
      },
      (info: ProgressInfo) => {
        if (typeof info.progress === "number") {
          progress.value = Math.round(info.progress);
        }
      },
    );
    device.value = used;
    status.value = "running";
    const out = await runModel(
      key,
      "DriftNote on-device model runtime self-test.",
      {
        pooling: "mean",
        normalize: true,
      },
    );
    const vec = readVector(out);
    dims.value = vec.length;
    sample.value = vec
      .slice(0, 4)
      .map((n) => n.toFixed(4))
      .join(", ");
    status.value = "done";
  } catch (err) {
    status.value = "error";
    errorMsg.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div data-testid="ml-selftest">
    <button
      type="button"
      data-testid="ml-run"
      :disabled="status === 'loading' || status === 'running'"
      @click="run"
    >
      Run on-device model self-test
    </button>
    <p data-testid="ml-status">status: {{ status }}</p>
    <p v-if="device">
      device: <span data-testid="ml-device">{{ device }}</span>
    </p>
    <p v-if="status === 'loading' && progress">downloading: {{ progress }}%</p>
    <p v-if="dims !== null">
      embedding dims: <span data-testid="ml-dims">{{ dims }}</span>
    </p>
    <p v-if="sample">
      sample: <span data-testid="ml-sample">{{ sample }}</span>
    </p>
    <p v-if="errorMsg" data-testid="ml-error" class="ml-error">
      {{ errorMsg }}
    </p>
  </div>
</template>

<style scoped>
.ml-error {
  color: var(--danger, red);
}
</style>
