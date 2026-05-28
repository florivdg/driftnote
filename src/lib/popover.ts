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

export function attachDismiss(h: DismissHandlers): void {
  setTimeout(() => {
    document.addEventListener("mousedown", h.onPointerDown);
    document.addEventListener("keydown", h.onKeyDown);
  }, 0);
}

export function detachDismiss(h: DismissHandlers): void {
  document.removeEventListener("mousedown", h.onPointerDown);
  document.removeEventListener("keydown", h.onKeyDown);
}

export function placePopover(el: HTMLElement, pos: PopoverPosition): void {
  el.style.setProperty("--popover-top", `${pos.top}px`);
  el.style.setProperty("--popover-right", `${pos.right}px`);
  el.querySelector<HTMLElement>("a, button")?.focus();
}
