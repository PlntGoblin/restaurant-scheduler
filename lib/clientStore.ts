'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * localStorage, read as a React external store.
 *
 * Every screen in this app persists to localStorage, and every one of them
 * used to read it the same way: render empty, then `setState` from inside a
 * mount effect. That renders twice on every mount, and React flags it
 * (`react-hooks/set-state-in-effect`) because a setState that runs as a
 * direct consequence of an effect is the shape a cascading render loop takes.
 *
 * The obvious fix -- a lazy `useState` initialiser -- is WRONG here. These
 * pages are prerendered, so the initialiser would run on the server where
 * `localStorage` does not exist, and the markup React hydrates against would
 * disagree with what the browser actually holds.
 *
 * `useSyncExternalStore` is the one that handles both halves: `getServerSnapshot`
 * answers the prerender AND the hydration pass with the fallback, then React
 * re-reads from the browser the moment hydration finishes. Subscribers are a
 * bonus the old pattern never had -- a write on one screen now reaches any
 * other screen already mounted, and a second tab stays honest.
 *
 * Callers MUST pass a module-level `fallback` and `accept`. Both feed
 * `useCallback` deps, so a fresh `[]` or inline arrow on each render would
 * resubscribe forever.
 */

/** Same-tab writes. `storage` only fires in OTHER tabs, never the one writing. */
const WRITE_EVENT = 'scheduler:local-write';

/**
 * `getSnapshot` must return the SAME reference while the underlying string is
 * unchanged, or React re-renders until it gives up. So the parse is cached
 * against the exact raw text it came from.
 *
 * Keyed by storage key alone: one key, one shape, app-wide.
 */
const cache = new Map<string, { raw: string | null; value: unknown }>();

/**
 * Read and validate a JSON key, reusing the previous parse when the stored
 * text has not moved. Exported for imperative reads (`loadStaff`) so they
 * share one cache with the subscribed ones.
 */
export function readLocalJSON<T>(
  key: string,
  fallback: T,
  accept: (value: unknown) => value is T,
): T {
  const raw = localStorage.getItem(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value = fallback;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      // A corrupt or outdated entry falls back rather than blanking the
      // screen with a render-time crash; the screen shows its empty state and
      // the manager can rebuild. Cached either way, so this logs once per
      // distinct bad value rather than once per render.
      if (accept(parsed)) value = parsed;
      else console.error(`Ignoring malformed "${key}" in localStorage`);
    } catch (error) {
      console.error(`Could not parse "${key}" from localStorage:`, error);
    }
  }

  cache.set(key, { raw, value });
  return value;
}

/** Fire `onChange` when `key` changes -- in this tab or another one. */
export function subscribeLocalJSON(key: string, onChange: () => void): () => void {
  const onWrite = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key) onChange();
  };
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` -- everything changed.
    if (event.key === null || event.key === key) onChange();
  };
  window.addEventListener(WRITE_EVENT, onWrite);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(WRITE_EVENT, onWrite);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Persist a value and tell every subscriber in this tab.
 *
 * The written value is cached under the exact text written, so the next
 * snapshot hands back this same object instead of re-parsing it. Pass a fresh
 * value rather than a mutated one -- the store keeps the reference.
 */
export function writeLocalJSON(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  cache.set(key, { raw, value });
  window.dispatchEvent(new CustomEvent(WRITE_EVENT, { detail: key }));
}

/** Read a JSON-encoded localStorage key as state. See the note on stability above. */
export function useLocalJSON<T>(
  key: string,
  fallback: T,
  accept: (value: unknown) => value is T,
): T {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeLocalJSON(key, onChange), [key]),
    useCallback(() => readLocalJSON(key, fallback, accept), [key, fallback, accept]),
    useCallback(() => fallback, [fallback]),
  );
}
