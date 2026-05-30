export function parseTags(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function buildSearch(params: URLSearchParams): string {
  const s = params.toString();
  return s ? `?${s}` : "";
}

function clone(url: URL): URLSearchParams {
  return new URLSearchParams(url.search);
}

function setTags(params: URLSearchParams, tags: string[]) {
  if (tags.length === 0) params.delete("tags");
  else params.set("tags", tags.join(","));
}

export function toggleTag(url: URL, name: string): string {
  const params = clone(url);
  const cur = parseTags(params.get("tags"));
  const next = cur.includes(name)
    ? cur.filter((t) => t !== name)
    : [...cur, name];
  setTags(params, next);
  return `${url.pathname}${buildSearch(params)}`;
}

export function removeTag(url: URL, name: string): string {
  const params = clone(url);
  const next = parseTags(params.get("tags")).filter((t) => t !== name);
  setTags(params, next);
  return `${url.pathname}${buildSearch(params)}`;
}

export function setQuery(url: URL, q: string): string {
  const params = clone(url);
  if (q) params.set("q", q);
  else params.delete("q");
  return `${url.pathname}${buildSearch(params)}`;
}

export function setFlag(
  url: URL,
  key: "untagged" | "source" | "archived" | "sort" | "from" | "to",
  value: string | null,
): string {
  const params = clone(url);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return `${url.pathname}${buildSearch(params)}`;
}

// ISO date (UTC midnight) for `n` days ago, used by the "last N days" quick
// filter. Pinning to the UTC day boundary keeps SSR and client output identical.
export function isoDaysAgo(n: number, now: number = Date.now()): string {
  const d = new Date(now - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// Apply a `?from=` lower bound while clearing any stale `?to=` upper bound,
// so the "last N days" entry point reads as a single open-ended range.
export function setDateFrom(url: URL, from: string | null): string {
  const params = clone(url);
  if (from === null) params.delete("from");
  else params.set("from", from);
  params.delete("to");
  return `${url.pathname}${buildSearch(params)}`;
}

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function safeParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

// Rejects javascript:, data:, etc. so a malicious OAuth client cannot
// register a redirect_uri that executes script when the consent page
// navigates to it via location.assign.
export function isAllowedRedirectUri(uri: string): boolean {
  const parsed = safeParseUrl(uri);
  if (!parsed) return false;
  if (parsed.protocol === "https:") return true;
  return parsed.protocol === "http:" && LOCALHOST_HOSTS.has(parsed.hostname);
}
