// Fixed-window rate limiter keyed by an arbitrary string (usually a userId).
// In-process Map — fine for single-process Bun. Each Bucket is independent.

import { audit } from "@/lib/audit";

export type Bucket = {
  windowMs: number;
  max: number;
  hits: Map<string, { count: number; resetAt: number }>;
  nextSweepAt: number;
};

export type CheckResult = { ok: true } | { ok: false; retryAfter: number };

export function createBucket(windowMs: number, max: number): Bucket {
  return { windowMs, max, hits: new Map(), nextSweepAt: 0 };
}

function sweepIfDue(bucket: Bucket, now: number): void {
  if (now < bucket.nextSweepAt) return;
  for (const [key, entry] of bucket.hits) {
    if (entry.resetAt <= now) bucket.hits.delete(key);
  }
  bucket.nextSweepAt = now + bucket.windowMs;
}

export function checkRate(bucket: Bucket, key: string): CheckResult {
  const now = Date.now();
  sweepIfDue(bucket, now);
  const entry = bucket.hits.get(key);
  if (!entry || entry.resetAt <= now) {
    bucket.hits.set(key, { count: 1, resetAt: now + bucket.windowMs });
    return { ok: true };
  }
  if (entry.count >= bucket.max) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

// Shared buckets. Imported by route handlers.
export const writeBucket = createBucket(10_000, 30);
export const readBucket = createBucket(10_000, 120);

export function rateLimitedResponse(retryAfter: number): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: { "retry-after": String(retryAfter) },
  });
}

export type Gate<T> = { ok: true; user: T } | { ok: false; res: Response };

export function gateRead<T extends { id: string }>(
  user: T | null,
  route: string,
): Gate<T> {
  if (!user)
    return { ok: false, res: new Response("Unauthorized", { status: 401 }) };
  const gate = checkRate(readBucket, user.id);
  if (gate.ok) return { ok: true, user };
  audit("rate_limited", { userId: user.id, route });
  return { ok: false, res: rateLimitedResponse(gate.retryAfter) };
}
