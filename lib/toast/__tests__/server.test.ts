import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BadRequestError,
  describeError,
  isConfiguredOrThrow,
  requireDateParam,
} from '../server';
import { ToastAPIError, ToastAuthError, ToastConfigError, isConfigured } from '../client';

const TOAST_VARS = [
  'TOAST_CLIENT_ID',
  'TOAST_CLIENT_SECRET',
  'TOAST_HOSTNAME',
  'TOAST_RESTAURANT_GUID',
] as const;

describe('isConfigured', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOAST_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of TOAST_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('is false with nothing set', () => {
    expect(isConfigured()).toBe(false);
    expect(() => isConfiguredOrThrow()).toThrow(ToastConfigError);
  });

  it('is false when only some values are set', () => {
    process.env.TOAST_CLIENT_ID = 'id';
    process.env.TOAST_CLIENT_SECRET = 'secret';
    expect(isConfigured()).toBe(false);
  });

  it('treats a whitespace-only value as unset', () => {
    for (const k of TOAST_VARS) process.env[k] = '   ';
    expect(isConfigured()).toBe(false);
  });

  it('is true once all four are set', () => {
    for (const k of TOAST_VARS) process.env[k] = 'x';
    expect(isConfigured()).toBe(true);
    expect(() => isConfiguredOrThrow()).not.toThrow();
  });
});

describe('describeError', () => {
  it('tells the three failure modes apart', () => {
    // "Not configured", "credentials rejected" and "rate limited" have three
    // different fixes; collapsing them into "failed to load" wastes a day.
    expect(describeError(new ToastConfigError('no hostname'))).toMatchObject({
      status: 503,
      body: { kind: 'config' },
    });
    expect(describeError(new ToastAuthError('nope'))).toMatchObject({
      status: 502,
      body: { kind: 'auth' },
    });
    expect(describeError(new ToastAPIError(429, 'slow down'))).toMatchObject({
      status: 429,
      body: { kind: 'rate_limited' },
    });
  });

  it('passes a non-429 Toast status through as an api error', () => {
    const { status, body } = describeError(new ToastAPIError(503, 'maintenance'));
    expect(status).toBe(502);
    expect(body.kind).toBe('api');
    expect(body.error).toContain('503');
  });

  it('answers a caller mistake as 400, not a server fault', () => {
    expect(describeError(new BadRequestError('bad date'))).toEqual({
      status: 400,
      body: { error: 'bad date', kind: 'bad_request' },
    });
  });

  it('still produces a usable body for an unexpected throw', () => {
    const { status, body } = describeError(new TypeError('fetch failed'));
    expect(status).toBe(500);
    expect(body.kind).toBe('unknown');
    expect(body.detail).toBe('fetch failed');
  });
});

describe('requireDateParam', () => {
  const url = (qs: string) => `http://localhost/api/toast/shifts${qs}`;

  it('accepts a real date', () => {
    expect(requireDateParam(url('?date=2026-10-20'))).toBe('2026-10-20');
  });

  it('rejects a missing, malformed or impossible date', () => {
    expect(() => requireDateParam(url(''))).toThrow(BadRequestError);
    expect(() => requireDateParam(url('?date=10/20/2026'))).toThrow(BadRequestError);
    // Rolls over to a real instant without the calendar check, which would
    // mean a confident empty answer for the wrong day.
    expect(() => requireDateParam(url('?date=2026-13-99'))).toThrow(/Not a real calendar date/);
  });
});
