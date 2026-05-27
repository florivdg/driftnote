export function isTypingInInput(el: Element | null): boolean {
  if (!el) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT";
}

function hasModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

export function isPlainHotkey(e: KeyboardEvent, key: string): boolean {
  if (e.key.toLowerCase() !== key.toLowerCase()) return false;
  if (hasModifier(e)) return false;
  return !isTypingInInput(document.activeElement);
}

function hasMouseModifier(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function isPlainLeftClick(e: MouseEvent): boolean {
  return !hasMouseModifier(e) && e.button === 0;
}
