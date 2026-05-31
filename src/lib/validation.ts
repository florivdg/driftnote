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

export type IdeaPatch =
  | { kind: "edit"; text: string }
  | { kind: "state"; archived?: boolean; pinned?: boolean };

function readOptionalBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function stateFromBody(p: {
  archived?: unknown;
  pinned?: unknown;
}): ParsedOr<IdeaPatch> {
  const archived = readOptionalBool(p.archived);
  const pinned = readOptionalBool(p.pinned);
  if (archived === undefined && pinned === undefined) {
    return {
      ok: false,
      res: new Response("text, archived, or pinned required", { status: 400 }),
    };
  }
  return { ok: true, value: { kind: "state", archived, pinned } };
}

// PATCH /api/ideas/[id] accepts EITHER a body edit (`text`) OR a state toggle
// (`archived`/`pinned`). The body is read once here and dispatched by shape:
// a `text` field means an edit, otherwise the boolean state flags are used.
export async function parseIdeaPatchBody(
  req: Request,
): Promise<ParsedOr<IdeaPatch>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  const p = parsed.value as {
    text?: unknown;
    archived?: unknown;
    pinned?: unknown;
  };
  if (p.text !== undefined) {
    const text = validateIdeaText(p.text);
    if (text === null) {
      return {
        ok: false,
        res: new Response("text must be 1-4000 chars", { status: 400 }),
      };
    }
    return { ok: true, value: { kind: "edit", text } };
  }
  return stateFromBody(p);
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

export type EmbeddingUpsert = {
  model: string;
  dim: number;
  vector: Buffer;
  contentHash: string;
};

// A model id / content hash is a short, non-empty string. The vector is a
// base64-encoded packed Float32 BLOB whose byte length must be exactly dim*4.
const MAX_EMBED_DIM = 4096;

function badEmbed(message: string): ParsedOr<never> {
  return { ok: false, res: new Response(message, { status: 400 }) };
}

function validShortString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s.length <= 256 ? s : null;
}

function isInBounds(v: number): boolean {
  return v > 0 && v <= MAX_EMBED_DIM;
}

function validDim(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return isInBounds(v) ? v : null;
}

// Decode the base64 vector and confirm its byte length matches dim*4 (one
// Float32 per dimension), so a malformed or mismatched payload is rejected
// before it reaches storage.
function decodeVectorPayload(v: unknown, dim: number): Buffer | null {
  if (typeof v !== "string") return null;
  try {
    const buf = Buffer.from(v, "base64");
    return buf.byteLength === dim * 4 ? buf : null;
  } catch {
    return null;
  }
}

type RawEmbedding = {
  model?: unknown;
  dim?: unknown;
  vector?: unknown;
  contentHash?: unknown;
};

// Validate the model + dim pair, the gate for decoding the vector (the byte
// length must equal dim*4). Kept separate so each validator stays under the
// complexity threshold.
function validModelDim(p: RawEmbedding): { model: string; dim: number } | null {
  const model = validShortString(p.model);
  const dim = validDim(p.dim);
  return model !== null && dim !== null ? { model, dim } : null;
}

// Validate and coerce the four embedding fields. Splitting this out of the
// public parser keeps each function under the complexity gate: this one owns
// the field checks, the parser owns only the read-JSON + assemble flow.
function validateEmbeddingFields(p: RawEmbedding): ParsedOr<EmbeddingUpsert> {
  const md = validModelDim(p);
  if (md === null) return badEmbed("invalid model or dim");
  const vector = decodeVectorPayload(p.vector, md.dim);
  const contentHash = validShortString(p.contentHash);
  if (vector === null || contentHash === null) {
    return badEmbed("invalid vector or contentHash");
  }
  return { ok: true, value: { ...md, vector, contentHash } };
}

export async function parseEmbeddingBody(
  req: Request,
): Promise<ParsedOr<EmbeddingUpsert>> {
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed;
  return validateEmbeddingFields(parsed.value as RawEmbedding);
}

export function parsePositiveInt(
  v: string | null,
  fallback: number,
  max: number,
): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function parseSourceParam(
  v: string | null,
): "text" | "voice" | undefined {
  if (v === "voice") return "voice";
  if (v === "text") return "text";
  return undefined;
}

export function parseSortParam(v: string | null): "newest" | "oldest" {
  return v === "oldest" ? "oldest" : "newest";
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// True when `v` round-trips through a real UTC calendar date (rejects e.g.
// 2026-02-31, which Date.parse would silently roll forward).
function isRealIsoDate(v: string): boolean {
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

// Accept a `YYYY-MM-DD` URL param only if it names a real calendar date.
// Returns the canonical string (so a round-trip is stable) or undefined.
export function parseDateParam(v: string | null): string | undefined {
  if (!v || !ISO_DATE_RE.test(v)) return undefined;
  return isRealIsoDate(v) ? v : undefined;
}
