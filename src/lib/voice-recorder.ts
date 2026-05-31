// Mic capture engine for the Composer's voice panel (#24).
//
// Wraps `getUserMedia` + `MediaRecorder` for the audio blob, plus an
// `AnalyserNode` that drives the real waveform bars. SSR-safe to import: no
// browser globals are touched until `start()` is called in the browser.

import { pickMimeType } from "@/lib/voice";

const WAVE_BARS = 32;

export type RecorderHandlers = {
  // Called ~per animation frame with `WAVE_BARS` normalised levels (0..1).
  onLevels: (levels: number[]) => void;
};

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private readonly handlers: RecorderHandlers;

  constructor(handlers: RecorderHandlers) {
    this.handlers = handlers;
  }

  // Open the mic, start recording, and begin pumping waveform levels. If any
  // step after getUserMedia fails (e.g. MediaRecorder construction), the mic
  // stream is torn down before the error propagates so no track is left open.
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const mimeType = pickMimeType();
      this.recorder = new MediaRecorder(
        this.stream,
        mimeType ? { mimeType } : undefined,
      );
      this.chunks = [];
      this.recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      });
      this.recorder.start();
      this.startMeter();
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  private startMeter(): void {
    if (!this.stream) return;
    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 64;
    source.connect(this.analyser);
    this.pump();
  }

  private pump = (): void => {
    const analyser = this.analyser;
    if (!analyser) return;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    const levels: number[] = [];
    for (let i = 0; i < WAVE_BARS; i++) {
      levels.push((bins[i % bins.length] ?? 0) / 255);
    }
    this.handlers.onLevels(levels);
    this.raf = requestAnimationFrame(this.pump);
  };

  // Stop recording and resolve with the captured audio blob.
  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const recorder = this.recorder;
      if (!recorder) {
        resolve(new Blob());
        return;
      }
      recorder.addEventListener("stop", () => {
        const type = recorder.mimeType || "audio/webm";
        resolve(new Blob(this.chunks, { type }));
        this.cleanup();
      });
      recorder.stop();
    });
  }

  // Tear down without producing a blob (e.g. start failed mid-way).
  abort(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.audioCtx) void this.audioCtx.close();
    this.stream = null;
    this.recorder = null;
    this.analyser = null;
    this.audioCtx = null;
  }
}

function isInsecureContext(): boolean {
  return typeof window !== "undefined" && !window.isSecureContext;
}

function hasMicApis(): boolean {
  const hasGum =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  return hasGum && typeof MediaRecorder !== "undefined";
}

// Mic capture needs a secure context plus the getUserMedia + MediaRecorder
// APIs. Returns a user-facing reason when unavailable, else null.
export function micUnsupportedReason(): string | null {
  if (isInsecureContext()) {
    return "Voice capture needs a secure (HTTPS) connection.";
  }
  if (!hasMicApis()) {
    return "Voice capture isn't supported in this browser.";
  }
  return null;
}

// Each getUserMedia/MediaRecorder DOMException name maps to a user-facing
// message, distinguishing an explicit permission denial from other failures.
const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: "Microphone permission denied.",
  SecurityError: "Microphone permission denied.",
  NotFoundError: "No microphone is available.",
  NotReadableError: "No microphone is available.",
};

export function describeMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  return MIC_ERRORS[name] ?? "Could not start voice capture. Try again.";
}

export { WAVE_BARS };
