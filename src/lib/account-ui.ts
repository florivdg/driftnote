import { LOCALE } from "@/lib/time";

export function errorString(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Pin the locale (shared with lib/time.ts) so SSR (Bun → en-US) and client
// hydration render identical text; an ambient locale produces Vue hydration
// mismatches.
export function formatStamp(ms: number | null): string {
  if (ms === null) return "unknown";
  return new Date(ms).toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
