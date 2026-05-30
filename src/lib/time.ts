// dayLabel/formatTime run during both SSR and client hydration. Passing
// `undefined` as the locale uses the runtime default, which differs between the
// server (Bun → en-US) and the browser (the user's locale) and produces Vue
// hydration mismatches. Pin a fixed locale so both sides render identically;
// en-US matches the rest of the UI, which is hard-coded English.
export const LOCALE = "en-US";

export const WEEKDAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const MONTHS_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export type IdeaLike = { id: string; createdAt: number; pinned?: boolean };

export type DayGroup<T extends IdeaLike> = {
  key: string;
  label: string;
  items: T[];
  ts: number;
};

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayLabel(d: Date, now: Date = new Date()): string {
  const today = now;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  const diff = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) {
    return d.toLocaleDateString(LOCALE, { weekday: "long" });
  }
  return d.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}

export function formatTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const mins = Math.round((now - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return d
    .toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}

export function groupByDay<T extends IdeaLike>(ideas: T[]): DayGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const i of ideas) {
    const key = new Date(i.createdAt).toDateString();
    const arr = buckets.get(key) ?? [];
    arr.push(i);
    buckets.set(key, arr);
  }
  const groups: DayGroup<T>[] = [];
  for (const [key, items] of buckets) {
    // Pinned notes float to the top of their day; the server already orders the
    // stream pinned-first, but day-bucketing would otherwise re-sort by recency
    // and drop a pinned note below a newer same-day one. All items in a bucket
    // share one calendar day, so the day label/order (below) stay correct.
    items.sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt,
    );
    groups.push({
      key,
      label: dayLabel(new Date(items[0].createdAt)),
      items,
      ts: items[0].createdAt,
    });
  }
  groups.sort((a, b) => b.ts - a.ts);
  return groups;
}
