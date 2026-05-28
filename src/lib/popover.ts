// Shared positioning + dismiss wiring for fixed-position popovers (menus,
// pickers). Anchors below a trigger and exposes CSS custom properties the
// stylesheet reads (--popover-top / --popover-right). Framework-agnostic.

export type DismissHandlers = {
  onPointerDown: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
};

export type PopoverPosition = { top: number; right: number };

export function anchorBelow(
  trigger: HTMLElement,
  gap: number,
): PopoverPosition {
  const r = trigger.getBoundingClientRect();
  return {
    top: r.bottom + gap,
    right: Math.max(12, window.innerWidth - r.right),
  };
}

// Attach is deferred a tick so the click that opened the popover doesn't
// immediately dismiss it. Track the pending timer so a detach that happens
// before it fires (quick close, unmount) cancels the attach instead of
// leaking listeners onto document.
const pendingAttach = new WeakMap<
  DismissHandlers,
  ReturnType<typeof setTimeout>
>();

export function attachDismiss(h: DismissHandlers): void {
  const timer = setTimeout(() => {
    pendingAttach.delete(h);
    document.addEventListener("mousedown", h.onPointerDown);
    document.addEventListener("keydown", h.onKeyDown);
  }, 0);
  pendingAttach.set(h, timer);
}

export function detachDismiss(h: DismissHandlers): void {
  const timer = pendingAttach.get(h);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingAttach.delete(h);
  }
  document.removeEventListener("mousedown", h.onPointerDown);
  document.removeEventListener("keydown", h.onKeyDown);
}

export function placePopover(el: HTMLElement, pos: PopoverPosition): void {
  el.style.setProperty("--popover-top", `${pos.top}px`);
  el.style.setProperty("--popover-right", `${pos.right}px`);
  el.querySelector<HTMLElement>("a, button")?.focus();
}

// Dismiss handlers for a trigger+surface popover: ignore pointerdowns on the
// trigger (its own @click toggles, and closing here would race that click and
// reopen), close on an outside pointerdown, and close + refocus the trigger on
// Escape. `trigger`/`surface` are getters so they read the live refs.
export function createDismissHandlers(opts: {
  trigger: () => HTMLElement | null;
  surface: () => HTMLElement | null;
  close: () => void;
}): DismissHandlers {
  return {
    onPointerDown(e) {
      const target = e.target as Node;
      if (opts.trigger()?.contains(target)) return;
      const el = opts.surface();
      if (el && !el.contains(target)) opts.close();
    },
    onKeyDown(e) {
      if (e.key !== "Escape") return;
      opts.close();
      opts.trigger()?.focus();
    },
  };
}
