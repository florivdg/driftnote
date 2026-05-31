<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import { extractTags } from "@/lib/tags";
import { isPlainHotkey, isSaveHotkey } from "@/lib/keyboard";
import { notifyStreamChanged } from "@/lib/url-state";
import { WAVE_BARS, VoiceRecorder } from "@/lib/voice-recorder";
import {
  blobToPcm16k,
  readVoiceLang,
  transcribe,
  writeVoiceLang,
} from "@/lib/voice";
import type { VoiceLang } from "@/lib/voice";

const props = defineProps<{
  suggested: string[];
}>();

type VoicePhase = "idle" | "recording" | "loading" | "transcribing";

const text = ref("");
const submitting = ref(false);
const phase = ref<VoicePhase>("idle");
const elapsed = ref(0);
const levels = ref<number[]>(Array.from({ length: WAVE_BARS }, () => 0));
const downloadPct = ref(0);
const voiceError = ref("");
const lang = ref<VoiceLang>("auto");
const sourceForNextSubmit = ref<"text" | "voice">("text");
const statusMsg = ref("");
const ta = useTemplateRef<HTMLTextAreaElement>("ta");

let recorder: VoiceRecorder | null = null;
let recTimer: ReturnType<typeof setInterval> | null = null;

const recording = computed(() => phase.value !== "idle");
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

watch(lang, (value) => writeVoiceLang(value));

function clearRecTimer(): void {
  if (recTimer) {
    clearInterval(recTimer);
    recTimer = null;
  }
}

function resetVoiceState(): void {
  clearRecTimer();
  elapsed.value = 0;
  downloadPct.value = 0;
  levels.value = levels.value.map(() => 0);
}

async function startRecording(): Promise<void> {
  voiceError.value = "";
  recorder = new VoiceRecorder({ onLevels: (l) => (levels.value = l) });
  try {
    await recorder.start();
  } catch {
    recorder = null;
    voiceError.value = "Microphone permission denied.";
    statusMsg.value = voiceError.value;
    return;
  }
  phase.value = "recording";
  elapsed.value = 0;
  statusMsg.value = "Listening for voice input.";
  recTimer = setInterval(() => (elapsed.value += 1), 1000);
}

async function toggleRecording(): Promise<void> {
  if (phase.value === "idle") await startRecording();
  else if (phase.value === "recording") await stopRecording();
}

function appendTranscript(transcript: string): void {
  if (!transcript) return;
  text.value = (text.value ? text.value + " " : "") + transcript;
  sourceForNextSubmit.value = "voice";
}

async function stopRecording(): Promise<void> {
  clearRecTimer();
  if (!recorder) {
    phase.value = "idle";
    return;
  }
  const blob = await recorder.stop();
  recorder = null;
  await runTranscription(blob);
}

async function runTranscription(blob: Blob): Promise<void> {
  phase.value = "loading";
  statusMsg.value = "Preparing transcription model.";
  try {
    const pcm = await blobToPcm16k(blob);
    phase.value = "transcribing";
    statusMsg.value = "Transcribing your voice memo.";
    const transcript = await transcribe(
      pcm,
      lang.value,
      (pct) => (downloadPct.value = pct),
    );
    appendTranscript(transcript);
    statusMsg.value = transcript
      ? "Voice transcript ready."
      : "No speech detected.";
    if (!transcript) voiceError.value = "No speech detected. Try again.";
  } catch (err) {
    console.error(err);
    voiceError.value = "Transcription failed. Try again.";
    statusMsg.value = voiceError.value;
  } finally {
    resetVoiceState();
    phase.value = "idle";
    ta.value?.focus();
  }
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
    notifyStreamChanged();
  } catch (err) {
    console.error(err);
  } finally {
    submitting.value = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (isSaveHotkey(e)) {
    e.preventDefault();
    submit();
  }
}

function onGlobalKey(e: KeyboardEvent) {
  if (!isPlainHotkey(e, "m")) return;
  e.preventDefault();
  void toggleRecording();
}

function addSuggestion(t: string) {
  if (tags.value.includes(t)) return;
  text.value = (text.value.trimEnd() + " #" + t + " ").replace(/^ +/, "");
  ta.value?.focus();
}

onMounted(() => {
  lang.value = readVoiceLang();
  window.addEventListener("keydown", onGlobalKey);
});

onBeforeUnmount(() => {
  clearRecTimer();
  recorder?.abort();
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
        <template v-if="phase === 'loading'">
          Loading model… {{ downloadPct }}%
        </template>
        <template v-else-if="phase === 'transcribing'">
          Transcribing…
        </template>
        <template v-else> Listening… </template>
        <span class="cursor"></span>
      </div>
      <div class="voice-panel">
        <div class="voice-wave" data-testid="voice-wave">
          <span
            v-for="(level, i) in levels"
            :key="i"
            :style="{
              height: Math.max(3, Math.round(level * 28)) + 'px',
              animation: 'none',
            }"
          ></span>
        </div>
        <span class="voice-time">{{ mmss }}</span>
        <button
          class="btn"
          type="button"
          :disabled="phase !== 'recording'"
          data-testid="voice-stop"
          @click="stopRecording"
        >
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
      <p v-if="voiceError" class="voice-error" data-testid="voice-error">
        {{ voiceError }}
      </p>
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
      <span class="composer-add-label">Add →</span>
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
        :class="['mic-btn', phase === 'recording' && 'recording']"
        type="button"
        :disabled="phase === 'loading' || phase === 'transcribing'"
        :title="recording ? 'Stop recording' : 'Record voice'"
        data-testid="mic-btn"
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
      <label class="voice-lang" title="Transcription language">
        <span class="visually-hidden">Transcription language</span>
        <select v-model="lang" data-testid="voice-lang">
          <option value="auto">Auto</option>
          <option value="english">EN</option>
          <option value="german">DE</option>
        </select>
      </label>
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
