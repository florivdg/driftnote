import { parseTags } from "@/lib/url";
import {
  parseDateParam,
  parseSortParam,
  parseSourceParam,
} from "@/lib/validation";
import { isPlainLeftClick } from "@/lib/mouse";

export type Filters = {
  q: string;
  tags: string[];
  untagged: boolean;
  source: "text" | "voice" | null;
  archived: boolean;
  from: string | null;
  to: string | null;
  sort: "newest" | "oldest";
};

const URL_CHANGE_EVENT = "urlchange";
const STREAM_CHANGED_EVENT = "streamchanged";

// The SSR `initial` props for Sidebar/StreamView carry the active filter state
// under these field names (`query` instead of `q`); both islands build their
// reactive `Filters` from it, so the mapping lives here to avoid duplication.
export type InitialFilters = {
  query: string;
  tags: string[];
  untagged: boolean;
  source: "text" | "voice" | null;
  archived: boolean;
  from: string | null;
  to: string | null;
  sort: "newest" | "oldest";
};

export function initialFilters(init: InitialFilters): Filters {
  return {
    q: init.query,
    tags: init.tags,
    untagged: init.untagged,
    source: init.source,
    archived: init.archived,
    from: init.from,
    to: init.to,
    sort: init.sort,
  };
}

type FilterExtras = Pick<Filters, "archived" | "from" | "to" | "sort">;

function readExtras(p: URLSearchParams): FilterExtras {
  return {
    archived: p.get("archived") === "1",
    from: parseDateParam(p.get("from")) ?? null,
    to: parseDateParam(p.get("to")) ?? null,
    sort: parseSortParam(p.get("sort")),
  };
}

export function readFilters(url: URL): Filters {
  const p = url.searchParams;
  return {
    q: p.get("q") ?? "",
    tags: parseTags(p.get("tags")),
    untagged: p.get("untagged") === "1",
    source: parseSourceParam(p.get("source")) ?? null,
    ...readExtras(p),
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

function writeExtras(params: URLSearchParams, filters: Filters): void {
  if (filters.archived) params.set("archived", "1");
  setIfPresent(params, "from", filters.from);
  setIfPresent(params, "to", filters.to);
  if (filters.sort === "oldest") params.set("sort", "oldest");
}

export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams();
  setIfPresent(params, "q", filters.q);
  if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
  if (filters.untagged) params.set("untagged", "1");
  setIfPresent(params, "source", filters.source);
  writeExtras(params, filters);
  const s = params.toString();
  return s ? `?${s}` : "";
}
