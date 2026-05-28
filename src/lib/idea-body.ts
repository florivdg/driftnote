import { TAG_PALETTE } from "@/lib/tags";

export type IdeaTag = { name: string; hue: number };

export type BodyPart =
  | { kind: "text"; value: string }
  | { kind: "tag"; value: string; hue?: number };

const HASHTAG_RE = /#[a-z][a-z0-9_-]*/gi;

function hueFor(name: string, linked: IdeaTag[]): number | undefined {
  const linkedTag = linked.find((t) => t.name === name);
  return linkedTag?.hue ?? TAG_PALETTE[name]?.hue;
}

function tagPart(raw: string, linked: IdeaTag[]): BodyPart {
  return {
    kind: "tag",
    value: raw,
    hue: hueFor(raw.slice(1).toLowerCase(), linked),
  };
}

export function parseIdeaBody(body: string, linked: IdeaTag[]): BodyPart[] {
  const parts: BodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(HASHTAG_RE)) {
    const idx = m.index;
    if (idx > last) parts.push({ kind: "text", value: body.slice(last, idx) });
    parts.push(tagPart(m[0], linked));
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push({ kind: "text", value: body.slice(last) });
  return parts;
}
