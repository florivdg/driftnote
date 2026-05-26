<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import { navigate } from "astro:transitions/client";
import { extractTags } from "@/lib/tags";
import { isPlainHotkey } from "@/lib/dom";

const props = defineProps<{
  suggested: string[];
}>();

const VOICE_SAMPLE =
  'Idea for a small ritual at the start of every project — write down what "done" means in one sentence, then put it in the folder. #product #writing';

const text = ref("");
const recording = ref(false);
const transcript = ref("");
const elapsed = ref(0);
const submitting = ref(false);
const sourceForNextSubmit = ref<"text" | "voice">("text");
const statusMsg = ref("");
const ta = useTemplateRef<HTMLTextAreaElement>("ta");

let recTimer: ReturnType<typeof setInterval> | null = null;
let transTimer: ReturnType<typeof setInterval> | null = null;

const tags = computed(() => extractTags(text.value));
const mmss = computed(() => {
  const e = elapsed.value;
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
});

watch(text, () => {
  const el = ta.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(240, el.scrollHeight) + "px";
});

watch(recording, (rec) => {
  clearTimers();
  if (rec) {
    transcript.value = "";
    elapsed.value = 0;
    statusMsg.value = "Listening for voice input.";
    recTimer = setInterval(() => (elapsed.value += 1), 1000);
    let i = 0;
    transTimer = setInterval(() => {
      i = Math.min(i + 2, VOICE_SAMPLE.length);
      transcript.value = VOICE_SAMPLE.slice(0, i);
      if (i >= VOICE_SAMPLE.length && transTimer) {
        clearInterval(transTimer);
        transTimer = null;
        statusMsg.value = "Voice transcript ready.";
      }
    }, 55);
  } else {
    statusMsg.value = "";
  }
});

function clearTimers() {
  if (recTimer) {
    clearInterval(recTimer);
    recTimer = null;
  }
  if (transTimer) {
    clearInterval(transTimer);
    transTimer = null;
  }
}

function toggleRecording() {
  recording.value = !recording.value;
}

function stopRecording() {
  recording.value = false;
  if (transcript.value) {
    text.value = (text.value ? text.value + " " : "") + transcript.value;
    sourceForNextSubmit.value = "voice";
  }
  transcript.value = "";
  elapsed.value = 0;
}

async function postIdea(body: string, source: "text" | "voice"): Promise<void> {
  const res = await fetch("/api/ideas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: body, source }),
  });
  if (!res.ok) throw new Error(`POST /api/ideas failed: ${res.status}`);
}

async function submit() {
  const body = text.value.trim();
  if (!body || submitting.value) return;
  submitting.value = true;
  try {
    await postIdea(body, sourceForNextSubmit.value);
    text.value = "";
    sourceForNextSubmit.value = "text";
    await navigate(location.pathname + location.search, {
      history: "replace",
    });
  } catch (err) {
    console.error(err);
    submitting.value = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    submit();
  }
}

function addSuggestion(t: string) {
  if (tags.value.includes(t)) return;
  text.value = (text.value.trimEnd() + " #" + t + " ").replace(/^ +/, "");
  ta.value?.focus();
}

function onGlobalKey(e: KeyboardEvent) {
  if (!isPlainHotkey(e, "m")) return;
  e.preventDefault();
  toggleRecording();
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKey);
});

onBeforeUnmount(() => {
  clearTimers();
  window.removeEventListener("keydown", onGlobalKey);
});
</script>

<template>
  <div class="composer">
    <span class="visually-hidden" aria-live="polite">{{ statusMsg }}</span>
    <div class="composer-body">
      <textarea
        ref="ta"
        v-model="text"
        :rows="2"
        placeholder="What's coming up?"
        aria-label="New idea"
        @keydown="onKeyDown"
      ></textarea>
    </div>

    <template v-if="recording">
      <div class="voice-transcript">
        {{ transcript || "Listening…" }}
        <span class="cursor"></span>
      </div>
      <div class="voice-panel">
        <div class="voice-wave">
          <span
            v-for="i in 32"
            :key="i"
            :style="{ animationDelay: `${((i - 1) % 8) * 0.08}s` }"
          ></span>
        </div>
        <span class="voice-time">{{ mmss }}</span>
        <button class="btn" @click="stopRecording" type="button">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop &amp; save
        </button>
      </div>
    </template>

    <div v-if="!recording && tags.length > 0" class="composer-tags">
      <span v-for="t in tags" :key="t" class="chip">
        <span class="chip-mark"></span>
        <span>{{ t }}</span>
      </span>
    </div>

    <div
      v-if="
        !recording &&
        tags.length === 0 &&
        suggested.length > 0 &&
        text.length > 0
      "
      class="composer-tags"
    >
      <span
        style="
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--ink-3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          align-self: center;
        "
      >
        Add →
      </span>
      <button
        v-for="t in suggested.slice(0, 4)"
        :key="t"
        type="button"
        class="chip btn-chip"
        @click="addSuggestion(t)"
      >
        <span class="chip-mark"></span>
        <span>{{ t }}</span>
      </button>
    </div>

    <div class="composer-bar">
      <button
        :class="['mic-btn', recording && 'recording']"
        type="button"
        :title="recording ? 'Stop recording' : 'Record voice'"
        @click="toggleRecording"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      </button>
      <span class="hint">
        <span v-if="recording" class="hot">Listening · speak naturally</span>
        <template v-else>
          <kbd>#</kbd> to tag · <kbd>⌘</kbd><kbd>↵</kbd> to save ·
          <kbd>M</kbd> to talk
        </template>
      </span>
      <button
        v-if="!recording"
        class="btn btn-primary"
        type="button"
        :disabled="!text.trim() || submitting"
        @click="submit"
      >
        Save
      </button>
    </div>
  </div>
</template>
