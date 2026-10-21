/**
 * Attempt limiting for the sign-in route.
 *
 * WHAT THIS IS HONESTLY WORTH
 * The counters live in memory, in one serverless instance. Vercel runs several
 * concurrently and recycles them, so an attacker who spreads requests across
 * instances gets more than `max` attempts overall, and a quiet period wipes
 * the counters entirely. This is a speed bump, not a lock.
 *
 * It is still worth having: it turns "unlimited guesses at whatever speed you
 * like" into something slow and noisy, which is the difference that matters
 * for a password a room full of people share. Doing it properly needs a
 * durable shared store, and this app deliberately has no writable one -- its
 * only database credential is read-only by design (see lib/links/db.ts).
 *
 * Deliberately NOT a global cap across all callers: that would let anyone lock
 * the restaurant out of its own scheduler during a rush, which is a worse
 * outcome than the guessing it would prevent.
 */

export interface RateLimitOptions {
  /** Failures allowed inside the window before the caller is refused. */
  max: number;
  windowMs: number;
}

/** Matches Forecast86's sign-in limiter, so the two behave the same way. */
export const LOGIN_RATE_LIMIT: RateLimitOptions = {
  max: 5,
  windowMs: 15 * 60 * 1000,
};

/** Failure timestamps per caller. Injectable so tests need no fake clock. */
export type RateLimitStore = Map<string, number[]>;

export function createStore(): RateLimitStore {
  return new Map();
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Attempts left before refusal. 0 when already refused. */
  remaining: number;
  /** Seconds until the oldest failure ages out. 0 when allowed. */
  retryAfterSeconds: number;
}

function prune(store: RateLimitStore, key: string, now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  const kept = (store.get(key) ?? []).filter((t) => t > cutoff);
  if (kept.length === 0) store.delete(key);
  else store.set(key, kept);
  return kept;
}

/**
 * May this caller attempt a sign-in? Does not record anything -- a check that
 * counted would punish people for merely loading the page.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  now: number,
  opts: RateLimitOptions = LOGIN_RATE_LIMIT,
): RateLimitVerdict {
  const hits = prune(store, key, now, opts.windowMs);
  if (hits.length < opts.max) {
    return { allowed: true, remaining: opts.max - hits.length, retryAfterSeconds: 0 };
  }
  const oldest = Math.min(...hits);
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)),
  };
}

/** Record one FAILED attempt. Successes never count against anyone. */
export function recordFailure(
  store: RateLimitStore,
  key: string,
  now: number,
  opts: RateLimitOptions = LOGIN_RATE_LIMIT,
): void {
  const hits = prune(store, key, now, opts.windowMs);
  hits.push(now);
  store.set(key, hits);
}

/**
 * Forget a caller's failures.
 *
 * Called on a successful sign-in: someone who mistyped twice and then got it
 * right should not be four-fifths of the way to a lockout for the next quarter
 * hour, on a password an entire shift shares and regularly fat-fingers.
 */
export function clearFailures(store: RateLimitStore, key: string): void {
  store.delete(key);
}

/**
 * Who is calling?
 *
 * `x-forwarded-for` is attacker-controllable in general, but on Vercel the
 * platform sets the leftmost entry and it cannot be spoofed past the edge.
 * Spoofing it would only move an attacker between buckets anyway -- it cannot
 * grant more attempts to a bucket than the limit allows.
 *
 * Callers with no identifiable address share the 'unknown' bucket, which is
 * the conservative direction: unidentifiable traffic is limited together.
 */
export function callerKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
