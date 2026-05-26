const EPOCH = new Date("2024-01-01T00:00:00Z").getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function issueNumber(now: number = Date.now()): number {
  return Math.floor((now - EPOCH) / WEEK_MS);
}
