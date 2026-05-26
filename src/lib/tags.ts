export type TagPaletteEntry = { hue: number; label: string };

// Predefined defaults; new tags pick from HUE_CHOICES via defaultHueFor().
export const TAG_PALETTE: Record<string, TagPaletteEntry> = {
  product: { hue: 50, label: "product" },
  writing: { hue: 280, label: "writing" },
  film: { hue: 350, label: "film" },
  recipe: { hue: 140, label: "recipe" },
  travel: { hue: 220, label: "travel" },
  reading: { hue: 80, label: "reading" },
  side: { hue: 30, label: "side" },
  question: { hue: 195, label: "question" },
  music: { hue: 320, label: "music" },
  home: { hue: 110, label: "home" },
  gift: { hue: 10, label: "gift" },
  research: { hue: 245, label: "research" },
};

export const HUE_CHOICES = [
  10, 30, 50, 80, 110, 140, 170, 195, 220, 245, 280, 320, 350,
] as const;

export type Hue = (typeof HUE_CHOICES)[number];

export function isValidHue(n: number): n is Hue {
  return (HUE_CHOICES as readonly number[]).includes(n);
}

// Hashtag regex MUST match the sketch verbatim so seeded vs composed parse identically.
const TAG_RE = /#([a-z][a-z0-9_-]*)/gi;

export function extractTags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const t = m[1].toLowerCase();
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// Deterministic hue for unknown tags. Palette names short-circuit.
export function defaultHueFor(name: string): number {
  const known = TAG_PALETTE[name];
  if (known) return known.hue;
  // FNV-1a hash → index into HUE_CHOICES.
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return HUE_CHOICES[Math.abs(h) % HUE_CHOICES.length];
}
