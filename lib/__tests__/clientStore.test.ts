import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readLocalJSON, subscribeLocalJSON, writeLocalJSON } from '../clientStore';

/**
 * The tests here exist for one reason: `useSyncExternalStore` re-renders
 * until `getSnapshot` returns the same reference twice. A parse that hands
 * back a fresh array each call is an infinite render loop, and neither
 * TypeScript nor eslint can see it. So reference identity is the assertion.
 */

const store = new Map<string, string>();

// vitest runs in the node environment; the store needs the two browser
// globals it actually touches, and nothing more.
beforeEach(() => {
  store.clear();
  const target = new EventTarget();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', target);
});

const isNums = (v: unknown): v is number[] => Array.isArray(v);
const EMPTY: number[] = [];

describe('readLocalJSON', () => {
  it('returns the same reference while the stored text is unchanged', () => {
    store.set('k', '[1,2,3]');
    const first = readLocalJSON('k', EMPTY, isNums);
    expect(first).toEqual([1, 2, 3]);
    expect(readLocalJSON('k', EMPTY, isNums)).toBe(first);
  });

  it('returns the fallback itself for a missing key, every time', () => {
    expect(readLocalJSON('absent', EMPTY, isNums)).toBe(EMPTY);
    expect(readLocalJSON('absent', EMPTY, isNums)).toBe(EMPTY);
  });

  it('re-parses once the stored text changes', () => {
    store.set('k', '[1]');
    const first = readLocalJSON('k', EMPTY, isNums);
    store.set('k', '[1,2]');
    const second = readLocalJSON('k', EMPTY, isNums);
    expect(second).not.toBe(first);
    expect(second).toEqual([1, 2]);
  });

  it('falls back on corrupt JSON without re-parsing it each call', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.set('k', '{not json');
    expect(readLocalJSON('k', EMPTY, isNums)).toBe(EMPTY);
    expect(readLocalJSON('k', EMPTY, isNums)).toBe(EMPTY);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('falls back when the stored value parses but is the wrong shape', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.set('k', '{"nope":true}');
    expect(readLocalJSON('k', EMPTY, isNums)).toBe(EMPTY);
    spy.mockRestore();
  });
});

describe('writeLocalJSON', () => {
  it('persists, and hands the written value straight back', () => {
    const value = [4, 5];
    writeLocalJSON('k', value);
    expect(store.get('k')).toBe('[4,5]');
    expect(readLocalJSON('k', EMPTY, isNums)).toBe(value);
  });

  it('notifies subscribers of that key in the same tab', () => {
    // `storage` events never fire in the tab doing the writing, so without
    // this the writer's own screen would not update.
    const seen = vi.fn();
    const stop = subscribeLocalJSON('k', seen);
    writeLocalJSON('k', [1]);
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    writeLocalJSON('k', [2]);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('leaves subscribers of other keys alone', () => {
    const seen = vi.fn();
    const stop = subscribeLocalJSON('other', seen);
    writeLocalJSON('k', [1]);
    expect(seen).not.toHaveBeenCalled();
    stop();
  });
});
