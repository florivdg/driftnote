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
  key: "untagged" | "source",
  value: string | null,
): string {
  const params = clone(url);
  if (value === null) params.delete(key);
  else params.set(key, value);
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
