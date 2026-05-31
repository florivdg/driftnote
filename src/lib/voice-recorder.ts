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

  // Open the mic, start recording, and begin pumping waveform levels.
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

export { WAVE_BARS };
