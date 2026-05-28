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

// The hashtag grammar, defined once so every regex below derives from it and
// can't drift. TAG_TAIL is the continuation class; TAG_BODY is a full tag name.
const TAG_TAIL = "[a-z0-9_-]";
const TAG_BODY = `[a-z]${TAG_TAIL}*`;

// A tag name on its own (no leading #), matching the hashtag grammar.
const TAG_NAME_RE = new RegExp(`^${TAG_BODY}$`);

export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidTagName(name: string): boolean {
  return name.length <= 50 && TAG_NAME_RE.test(name);
}

// Hashtag regex MUST match the sketch verbatim so seeded vs composed parse identically.
const TAG_RE = new RegExp(`#(${TAG_BODY})`, "gi");

export function extractTags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const t = m[1].toLowerCase();
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// A regex matching a complete #name hashtag token (case-insensitive), stopping
// it from matching a prefix of a longer tag (#side vs #sidebar). Callers pass
// validated tag names ([a-z][a-z0-9_-]*), so no regex-escaping is needed.
function hashtagTokenRe(name: string): RegExp {
  return new RegExp(`#${name}(?!${TAG_TAIL})`, "gi");
}

// Build a body rewriter that renames every #oldName token to #newName. The regex
// is compiled once and reused across bodies (String#replace resets lastIndex).
export function hashtagRenamer(
  oldName: string,
  newName: string,
): (body: string) => string {
  const re = hashtagTokenRe(oldName);
  return (body) => body.replace(re, `#${newName}`);
}

// Build a body rewriter that drops the leading # of every #name token, leaving
// the bare word as plain text.
export function hashtagStripper(name: string): (body: string) => string {
  const re = hashtagTokenRe(name);
  return (body) => body.replace(re, name);
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
