// On-device voice capture + transcription helpers for the Composer (#24).
//
// This module is browser-only at call time, but importing it is SSR-safe: it
// never touches `window`, `navigator`, or the ML runtime at module top level.
// The Whisper model is loaded lazily through the shared worker runtime
// (`src/lib/ml/runtime.ts`) on first mic use, with WebGPU → WASM fallback.
//
// English and German are both supported: the language selector maps to
// Whisper's `language` option (omitted for auto-detect).

import type { ProgressInfo } from "@/lib/ml/runtime";

// Shipped default favours German quality; overridable per-instance via
// localStorage so users (and verification harnesses) can pick a model tier.
export const DEFAULT_VOICE_MODEL = "onnx-community/whisper-small";
// Per-module dtype is the documented Whisper recipe: the encoder is
// quantization-sensitive (fp16 on GPU), the decoder tolerates q4.
const DEFAULT_VOICE_DTYPE: Record<string, string> = {
  encoder_model: "fp16",
  decoder_model_merged: "q4",
};
const VOICE_MODEL_KEY = "driftnote_voice_model";
const VOICE_DTYPE_KEY = "driftnote_voice_dtype";
const VOICE_LANG_KEY = "driftnote_voice_lang";

// Whisper consumes mono 16 kHz PCM; anything else must be resampled first.
const TARGET_SAMPLE_RATE = 16000;

export type VoiceLang = "auto" | "english" | "german";

export function readVoiceModel(): string {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE_MODEL;
  return localStorage.getItem(VOICE_MODEL_KEY) || DEFAULT_VOICE_MODEL;
}

// A valid dtype map is a plain (non-array) object whose values are all strings,
// e.g. { encoder_model: "fp16", decoder_model_merged: "q4" }.
function isDtypeMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === "string");
}

// A bare string like "q8" is a valid dtype; a JSON object is a per-module map.
// Anything malformed (array, non-string values, bad JSON) falls back to the
// raw string so an invalid override can't reach Transformers.js.
function parseDtype(raw: string): string | Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isDtypeMap(parsed)) return parsed;
  } catch {
    // Not JSON — treat the raw value as a single dtype string.
  }
  return raw;
}

// Optional dtype override. Lets a chosen model tier pick a compatible
// quantization; falls back to the documented default recipe.
function readVoiceDtype(): string | Record<string, string> {
  if (typeof localStorage === "undefined") return DEFAULT_VOICE_DTYPE;
  const raw = localStorage.getItem(VOICE_DTYPE_KEY);
  return raw ? parseDtype(raw) : DEFAULT_VOICE_DTYPE;
}

export function readVoiceLang(): VoiceLang {
  if (typeof localStorage === "undefined") return "auto";
  const stored = localStorage.getItem(VOICE_LANG_KEY);
  if (stored === "english" || stored === "german") return stored;
  return "auto";
}

export function writeVoiceLang(lang: VoiceLang): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VOICE_LANG_KEY, lang);
}

// Pick the best-supported compressed container the browser exposes. Opus in
// WebM is preferred (Chromium/Firefox); mp4/aac is the Safari fallback.
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

// Average two stereo channels down to mono so Whisper sees a single track.
function toMono(audio: AudioBuffer): Float32Array {
  if (audio.numberOfChannels === 1) return audio.getChannelData(0);
  const left = audio.getChannelData(0);
  const right = audio.getChannelData(1);
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2;
  return mono;
}

// Linear-interpolation resample to 16 kHz. Good enough for ASR input and
// avoids pulling in a DSP dependency.
function resample(samples: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_SAMPLE_RATE) return samples;
  const ratio = fromRate / TARGET_SAMPLE_RATE;
  const outLength = Math.round(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const next = idx + 1 < samples.length ? samples[idx + 1] : samples[idx];
    out[i] = samples[idx] * (1 - frac) + next * frac;
  }
  return out;
}

// Decode a recorded blob into mono 16 kHz PCM ready for Whisper.
export async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return resample(toMono(buffer), buffer.sampleRate);
  } finally {
    void ctx.close();
  }
}

// Extract `{ text }` from the ASR pipeline result, which is either a single
// object or an array of chunk objects depending on chunking.
function readTranscript(result: unknown): string {
  if (Array.isArray(result)) {
    return result.map((r) => readTranscript(r)).join(" ");
  }
  const text = (result as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

let modelKey: string | null = null;
let loadedModel: string | null = null;

// Load (once) the configured Whisper model through the shared worker runtime,
// then transcribe the PCM samples. Reloads if the configured model changed.
export async function transcribe(
  pcm: Float32Array,
  lang: VoiceLang,
  onProgress: (percent: number) => void,
): Promise<string> {
  const { loadModel, runModel } = await import("@/lib/ml/runtime");
  const model = readVoiceModel();
  if (!modelKey || loadedModel !== model) {
    const handle = await loadModel(
      {
        task: "automatic-speech-recognition",
        model,
        dtype: readVoiceDtype(),
      },
      (info: ProgressInfo) => {
        if (typeof info.progress === "number") {
          onProgress(Math.round(info.progress));
        }
      },
    );
    modelKey = handle.key;
    loadedModel = model;
  }
  const options: Record<string, unknown> = {
    chunk_length_s: 30,
    stride_length_s: 5,
  };
  if (lang !== "auto") options.language = lang;
  const result = await runModel(modelKey, pcm, options);
  return readTranscript(result);
}
