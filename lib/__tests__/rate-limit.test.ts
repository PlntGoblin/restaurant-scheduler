import { describe, expect, it } from 'vitest';
import {
  LOGIN_RATE_LIMIT,
  callerKey,
  checkRateLimit,
  clearFailures,
  createStore,
  recordFailure,
} from '../rate-limit';

const T0 = 1_780_000_000_000;
const { max, windowMs } = LOGIN_RATE_LIMIT;

describe('checkRateLimit', () => {
  it('allows a caller with no history', () => {
    const v = checkRateLimit(createStore(), 'ip', T0);
    expect(v.allowed).toBe(true);
    expect(v.remaining).toBe(max);
    expect(v.retryAfterSeconds).toBe(0);
  });

  it('allows exactly `max` failures, then refuses', () => {
    const store = createStore();
    for (let i = 0; i < max; i++) {
      expect(checkRateLimit(store, 'ip', T0).allowed).toBe(true);
      recordFailure(store, 'ip', T0 + i);
    }
    const v = checkRateLimit(store, 'ip', T0 + max);
    expect(v.allowed).toBe(false);
    expect(v.remaining).toBe(0);
    expect(v.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts down the attempts remaining', () => {
    const store = createStore();
    recordFailure(store, 'ip', T0);
    recordFailure(store, 'ip', T0);
    expect(checkRateLimit(store, 'ip', T0).remaining).toBe(max - 2);
  });

  /** Checking must never itself consume an attempt. */
  it('is not a counter', () => {
    const store = createStore();
    for (let i = 0; i < 50; i++) checkRateLimit(store, 'ip', T0);
    expect(checkRateLimit(store, 'ip', T0).remaining).toBe(max);
  });

  it('forgets failures once the window passes', () => {
    const store = createStore();
    for (let i = 0; i < max; i++) recordFailure(store, 'ip', T0);
    expect(checkRateLimit(store, 'ip', T0 + windowMs - 1).allowed).toBe(false);
    expect(checkRateLimit(store, 'ip', T0 + windowMs + 1).allowed).toBe(true);
  });

  /**
   * Sliding, not fixed: five failures spread across the window must not all
   * expire at once and hand over a fresh five.
   */
  it('expires failures one at a time', () => {
    const store = createStore();
    for (let i = 0; i < max; i++) recordFailure(store, 'ip', T0 + i * 60_000);
    // The oldest ages out; exactly one attempt comes back.
    const v = checkRateLimit(store, 'ip', T0 + windowMs + 1);
    expect(v.allowed).toBe(true);
    expect(v.remaining).toBe(1);
  });

  it('reports a sane retry-after', () => {
    const store = createStore();
    for (let i = 0; i < max; i++) recordFailure(store, 'ip', T0);
    const v = checkRateLimit(store, 'ip', T0 + 60_000);
    expect(v.retryAfterSeconds).toBe(Math.ceil((windowMs - 60_000) / 1000));
  });

  it('keeps callers in separate buckets', () => {
    const store = createStore();
    for (let i = 0; i < max; i++) recordFailure(store, 'a', T0);
    expect(checkRateLimit(store, 'a', T0).allowed).toBe(false);
    expect(checkRateLimit(store, 'b', T0).allowed).toBe(true);
  });

  it('clears on success so a mistyped password is not held against you', () => {
    const store = createStore();
    for (let i = 0; i < max - 1; i++) recordFailure(store, 'ip', T0);
    clearFailures(store, 'ip');
    expect(checkRateLimit(store, 'ip', T0).remaining).toBe(max);
  });

  /** A blocked caller must not be able to wait out a stale bucket forever. */
  it('does not leak buckets for callers who stopped failing', () => {
    const store = createStore();
    recordFailure(store, 'ip', T0);
    expect(store.size).toBe(1);
    checkRateLimit(store, 'ip', T0 + windowMs + 1);
    expect(store.size).toBe(0);
  });
});

describe('callerKey', () => {
  it('takes the leftmost x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
    expect(callerKey(h)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(callerKey(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('buckets unidentifiable callers together rather than exempting them', () => {
    expect(callerKey(new Headers())).toBe('unknown');
    expect(callerKey(new Headers({ 'x-forwarded-for': '   ' }))).toBe('unknown');
  });
});
