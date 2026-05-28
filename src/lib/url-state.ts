import { parseTags } from "@/lib/url";
import { parseSourceParam } from "@/lib/validation";
import { isPlainLeftClick } from "@/lib/dom";

export type Filters = {
  q: string;
  tags: string[];
  untagged: boolean;
  source: "text" | "voice" | null;
};

const URL_CHANGE_EVENT = "urlchange";
const STREAM_CHANGED_EVENT = "streamchanged";

export function readFilters(url: URL): Filters {
  return {
    q: url.searchParams.get("q") ?? "",
    tags: parseTags(url.searchParams.get("tags")),
    untagged: url.searchParams.get("untagged") === "1",
    source: parseSourceParam(url.searchParams.get("source")) ?? null,
  };
}

export function currentFilters(): Filters {
  return readFilters(new URL(location.href));
}

export function applyURL(
  href: string,
  mode: "push" | "replace" = "push",
): void {
  const current = `${location.pathname}${location.search}`;
  if (href === current) return;
  if (mode === "replace") history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  window.dispatchEvent(new CustomEvent(URL_CHANGE_EVENT));
}

// Intercepts a primary-button click on an anchor, leaving cmd/ctrl/middle-click
// to the browser so users can still open links in a new tab.
export function interceptNav(e: MouseEvent, href: string): void {
  if (!isPlainLeftClick(e)) return;
  e.preventDefault();
  applyURL(href);
}

export function subscribeFilters(handler: (f: Filters) => void): () => void {
  const onChange = () => handler(currentFilters());
  window.addEventListener(URL_CHANGE_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(URL_CHANGE_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function notifyStreamChanged(): void {
  window.dispatchEvent(new CustomEvent(STREAM_CHANGED_EVENT));
}

export function subscribeStreamChanged(handler: () => void): () => void {
  window.addEventListener(STREAM_CHANGED_EVENT, handler);
  return () => window.removeEventListener(STREAM_CHANGED_EVENT, handler);
}

function setIfPresent(
  p: URLSearchParams,
  key: string,
  value: string | null,
): void {
  if (value) p.set(key, value);
}

export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams();
  setIfPresent(params, "q", filters.q);
  if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
  if (filters.untagged) params.set("untagged", "1");
  setIfPresent(params, "source", filters.source);
  const s = params.toString();
  return s ? `?${s}` : "";
}
