import { onBeforeUnmount, ref, shallowRef } from "vue";

export type DeletedNote = { body: string; source: "text" | "voice" };

const UNDO_WINDOW_MS = 6000;

async function recreateNote(note: DeletedNote): Promise<void> {
  const res = await fetch("/api/ideas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: note.body, source: note.source }),
  });
  if (!res.ok) throw new Error(`restore failed: ${res.status}`);
}

// Owns the transient "note deleted — undo?" affordance. `onRestored` runs after a
// successful re-create so the host can refresh its view; the note is re-created
// (new id / timestamp), which is acceptable for v1 client-side restore.
export function useUndoDelete(onRestored: () => void) {
  const pending = shallowRef<DeletedNote | null>(null);
  const restoring = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function dismiss(): void {
    clearTimer();
    pending.value = null;
    restoring.value = false;
  }

  function offer(note: DeletedNote): void {
    clearTimer();
    pending.value = note;
    restoring.value = false;
    timer = setTimeout(dismiss, UNDO_WINDOW_MS);
  }

  async function undo(): Promise<void> {
    const note = pending.value;
    if (!note || restoring.value) return;
    restoring.value = true;
    clearTimer();
    try {
      await recreateNote(note);
      pending.value = null;
      restoring.value = false;
      onRestored();
    } catch (err) {
      console.error("undo restore failed", err);
      restoring.value = false;
      // Keep the toast up so the user can retry within the window.
      timer = setTimeout(dismiss, UNDO_WINDOW_MS);
    }
  }

  onBeforeUnmount(clearTimer);

  return { pending, restoring, offer, undo, dismiss };
}
