/**
 * Server-side glue between the route handlers and the Toast client:
 * the Labor API fetchers, a short response cache, and error shaping.
 *
 * SERVER SIDE ONLY -- imports `./client`, which holds the credentials.
 */

import {
  ToastAPIError,
  ToastAuthError,
  ToastConfigError,
  isConfigured,
  toastGet,
} from './client';
import { laborWindow, parseLocalDate } from './time';
import type { ToastShift, ToastTimeEntry } from './shifts';
import {
  isRealPerson,
  type ToastEmployee,
  type ToastEmployeeDTO,
  toEmployeeDTO,
} from './match';

/**
 * A short cache in front of Toast.
 *
 * The Dashboard re-renders freely and a manager will press "Pull from Toast"
 * more than once while fixing links; Toast asks for >=5s between calls and
 * rate limits for real. 60s is long enough to absorb that and short enough
 * that a shift published a minute ago shows up.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Every active employee at the configured location.
 *
 * The GUID on these records is THE join key. Never match on names in stored
 * data: Toast returns legal names where this app shows chosen ones.
 */
export async function fetchEmployees(): Promise<ToastEmployeeDTO[]> {
  return cached('employees', async () => {
    const raw = await toastGet<ToastEmployee[]>('/labor/v1/employees');
    return (Array.isArray(raw) ? raw : [])
      .filter((e) => e && !e.deleted && e.guid)
      // Toast's own system accounts are not staff and must never be offered
      // as someone to schedule.
      .filter(isRealPerson)
      .map(toEmployeeDTO)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
}

/** Scheduled shifts for one restaurant-local calendar date. */
export async function fetchShifts(date: string): Promise<ToastShift[]> {
  return cached(`shifts:${date}`, async () => {
    const raw = await toastGet<ToastShift[]>('/labor/v1/shifts', laborWindow(date, 1));
    return Array.isArray(raw) ? raw : [];
  });
}

/** Actual clock-in/out records for one restaurant-local calendar date. */
export async function fetchTimeEntries(date: string): Promise<ToastTimeEntry[]> {
  return cached(`timeEntries:${date}`, async () => {
    const raw = await toastGet<ToastTimeEntry[]>('/labor/v1/timeEntries', laborWindow(date, 1));
    return Array.isArray(raw) ? raw : [];
  });
}

/** A caller problem, not a Toast problem -- answered as 400. */
/** A caller problem, not a Toast problem -- answered as 400. */
export class BadRequestError extends Error {}

export interface ToastErrorBody {
  error: string;
  /** Machine-readable, so the UI can distinguish the cases that matter. */
  kind: 'config' | 'auth' | 'rate_limited' | 'api' | 'bad_request' | 'unknown';
  detail?: string;
}

/**
 * Turn a thrown error into a response body that tells the user something
 * true. "Toast credentials were rejected", "Toast is rate limiting us", and
 * "TOAST_HOSTNAME isn't set" are three different problems with three
 * different fixes, and collapsing them into "failed to load" wastes an
 * afternoon.
 */
export function describeError(e: unknown): { status: number; body: ToastErrorBody } {
  if (e instanceof BadRequestError) {
    return { status: 400, body: { error: e.message, kind: 'bad_request' } };
  }
  if (e instanceof BadRequestError) {
    return { status: 400, body: { error: e.message, kind: 'bad_request' } };
  }
  if (e instanceof ToastConfigError) {
    return {
      status: 503,
      body: { error: 'Toast is not configured on this deployment.', kind: 'config', detail: e.message },
    };
  }
  if (e instanceof ToastAuthError) {
    return {
      status: 502,
      body: { error: 'Toast rejected our credentials.', kind: 'auth', detail: e.message },
    };
  }
  if (e instanceof ToastAPIError) {
    return e.status === 429
      ? {
          status: 429,
          body: { error: 'Toast is rate limiting us. Wait a few seconds and try again.', kind: 'rate_limited', detail: e.detail },
        }
      : {
          status: 502,
          body: { error: `Toast returned ${e.status}.`, kind: 'api', detail: e.detail },
        };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { status: 500, body: { error: 'Unexpected error talking to Toast.', kind: 'unknown', detail: message } };
}

/**
 * Validate the `date` query param, or explain what was expected.
 *
 * Uses the same calendar check the Labor API window does, so an impossible
 * date is a 400 here rather than a confident empty answer for whatever day
 * it happened to roll over into.
 */
export function requireDateParam(url: string): string {
  const date = new URL(url).searchParams.get('date');
  if (!date) {
    throw new BadRequestError("A 'date' query parameter in YYYY-MM-DD form is required.");
  }
  try {
    parseLocalDate(date);
  } catch (e) {
    throw new BadRequestError(e instanceof Error ? e.message : `Invalid date: ${date}`);
  }
  return date;
}

export function isConfiguredOrThrow(): void {
  if (!isConfigured()) {
    throw new ToastConfigError(
      'Set TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, TOAST_HOSTNAME and TOAST_RESTAURANT_GUID.',
    );
  }
}
