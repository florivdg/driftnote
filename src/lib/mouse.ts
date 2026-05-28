function hasMouseModifier(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function isPlainLeftClick(e: MouseEvent): boolean {
  return !hasMouseModifier(e) && e.button === 0;
}
