import { isValidHue, isValidTagName, normalizeTagName } from "@/lib/tags";

export type ParsedOr<T> = { ok: true; value: T } | { ok: false; res: Response };

const MAX_BODY_BYTES = 32_000;

function tooLarge(): ParsedOr<never> {
  return {
    ok: false,
    res: new Response("Payload too large", { status: 413 }),
  };
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function headerExceedsLimit(req: Request): boolean {
  const len = Number(req.headers.get("content-length"));
  return Number.isFinite(len) && len > MAX_BODY_BYTES;
}

async function drainBounded(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ParsedOr<{ chunks: Uint8Array[]; total: number }>> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  return { ok: true, value: { chunks, total } };
}

async function readBoundedBody(req: Request): Promise<ParsedOr<string>> {
  if (headerExceedsLimit(req)) return tooLarge();
  if (!req.body) return { ok: true, value: "" };
  const drained = await drainBounded(req.body.getReader());
  if (!drained.ok) return drained;
  const { chunks, total } = drained.value;
  return {
    ok: true,
    value: new TextDecoder().decode(concatChunks(chunks, total)),
  };
}

async function readJson(req: Request): Promise<ParsedOr<unknown>> {
  const body = await readBoundedBody(req);
  if (!body.ok) return body;
  if (body.value === "") {
    return { ok: false, res: new Response("Invalid JSON", { status: 400 }) };
  }
  try {
    return { ok: true, value: JSON.parse(body.value) };
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

export async function parseUpdateIdeaBody(
  req: Request,
): Promise<ParsedOr<{ text: string }>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  const p = parsed.value as { text?: unknown };
  const text = validateIdeaText(p.text);
  if (text === null) {
    return {
      ok: false,
      res: new Response("text must be 1-4000 chars", { status: 400 }),
    };
  }
  return { ok: true, value: { text } };
}

function validateTagName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = normalizeTagName(value);
  return isValidTagName(name) ? name : null;
}

function parseOptionalHue(v: unknown): ParsedOr<number | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v === "number" && isValidHue(v)) return { ok: true, value: v };
  return {
    ok: false,
    res: new Response("hue must be one of HUE_CHOICES", { status: 400 }),
  };
}

function parseOptionalName(v: unknown): ParsedOr<string | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  const name = validateTagName(v);
  if (name !== null) return { ok: true, value: name };
  return {
    ok: false,
    res: new Response("name must be a valid tag", { status: 400 }),
  };
}

export type TagPatch = { hue?: number; newName?: string };

function buildPatch(
  hue: number | undefined,
  newName: string | undefined,
): ParsedOr<TagPatch> {
  if (hue === undefined && newName === undefined) {
    return {
      ok: false,
      res: new Response("nothing to update", { status: 400 }),
    };
  }
  return { ok: true, value: { hue, newName } };
}

export async function parseTagPatchBody(
  req: Request,
): Promise<ParsedOr<TagPatch>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  const p = parsed.value as { hue?: unknown; name?: unknown };
  const hue = parseOptionalHue(p.hue);
  if (!hue.ok) return hue;
  const name = parseOptionalName(p.name);
  if (!name.ok) return name;
  return buildPatch(hue.value, name.value);
}

function validateDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 200) return null;
  return name;
}

export async function parseAccountPatchBody(
  req: Request,
): Promise<ParsedOr<{ name: string }>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  const p = parsed.value as { name?: unknown };
  const name = validateDisplayName(p.name);
  if (name === null) {
    return {
      ok: false,
      res: new Response("name must be 1-200 chars", { status: 400 }),
    };
  }
  return { ok: true, value: { name } };
}

export function parseSourceParam(
  v: string | null,
): "text" | "voice" | undefined {
  if (v === "voice") return "voice";
  if (v === "text") return "text";
  return undefined;
}
