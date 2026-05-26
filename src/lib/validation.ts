import { isValidHue } from "@/lib/tags";

export type ParsedOr<T> = { ok: true; value: T } | { ok: false; res: Response };

async function readJson(req: Request): Promise<ParsedOr<unknown>> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, res: new Response("Invalid JSON", { status: 400 }) };
  }
}

function validateIdeaText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > 4000) return null;
  return text;
}

export async function parseCreateIdeaBody(
  req: Request,
): Promise<ParsedOr<{ text: string; source: "text" | "voice" }>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  const p = parsed.value as { text?: unknown; source?: unknown };
  const text = validateIdeaText(p.text);
  if (text === null) {
    return {
      ok: false,
      res: new Response("text must be 1-4000 chars", { status: 400 }),
    };
  }
  const source: "text" | "voice" = p.source === "voice" ? "voice" : "text";
  return { ok: true, value: { text, source } };
}

export async function parseHueBody(req: Request): Promise<ParsedOr<number>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  const p = parsed.value as { hue?: unknown };
  const hue = typeof p.hue === "number" ? p.hue : Number.NaN;
  if (!isValidHue(hue)) {
    return {
      ok: false,
      res: new Response("hue must be one of HUE_CHOICES", { status: 400 }),
    };
  }
  return { ok: true, value: hue };
}

export function parseSourceParam(
  v: string | null,
): "text" | "voice" | undefined {
  if (v === "voice") return "voice";
  if (v === "text") return "text";
  return undefined;
}
