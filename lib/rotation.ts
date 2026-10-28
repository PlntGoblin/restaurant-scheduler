/**
 * Lunch-rush rotation: who stands where, for each of the three hourly slots.
 *
 * This is a pure function of (today's staff, today's settings, the last 7
 * days). No React, no localStorage -- the component feeds it and renders
 * what comes back, and the tests in `__tests__/rotation.test.ts` pin every
 * rule below.
 *
 * The rules, in plain English, in priority order:
 *
 *   1. Grill 1 and Grill 2 are ONE station ("Grill"); so are Lobby/Dish 1
 *      and 2. Every rule below reads the station, never the numbered slot.
 *   2. Nobody works a hot station (Grill, Fries) in two consecutive slots.
 *   3. Nobody works the same station twice in one day.
 *   4. The grill opener skips hot stations during 11am-12pm.
 *   5. Hot stations go to whoever has had the FEWEST hot shifts -- today
 *      first, then over the last 7 days. Preference only breaks ties.
 *   6. Everything else is filled by preference, then by variety.
 *
 * Why hot stations are placed first, across the WHOLE day: a 6-person day
 * has 8 hot cells (3 + 3 + 2), so somebody is hot twice no matter what. The
 * only fair way to decide who is to look at all three slots at once. Doing
 * it slot by slot (the old greedy scorer) left the second hour's Fries to
 * whoever was left over -- usually someone who had just come off the grill.
 *
 * Rules 2-4 are hard. When a roster makes them unsatisfiable (odd shift
 * durations, mostly), rule 2 is relaxed for the remaining cells and the
 * result says so in `relaxed`, so the UI can flag it rather than silently
 * hand out a worse schedule.
 */

import { ALL_POSITIONS, TIME_SLOTS } from '@/lib/constants';
import type { DailyStaff, Position, PositionPreference, TimeSlot } from '@/lib/types';

export interface ScheduleAssignment {
  position: Position;
  staffName: string;
  staffId: string;
}

export type Schedule = Record<TimeSlot, ScheduleAssignment[]>;

export interface RotationStaff {
  id: string;
  name: string;
  availableSlots: TimeSlot[];
  preferences: PositionPreference[];
}

/** One day, as History stores it. The rotation reads only `schedule`. */
export interface HistoryDay {
  date?: string;
  staff?: DailyStaff[];
  grillOpener?: string;
  schedule?: Partial<Record<TimeSlot, ScheduleAssignment[]>>;
}

export interface RotationInput {
  staff: RotationStaff[];
  /** Staff id of today's grill opener, or '' for none. */
  grillOpener: string;
  /** Slow Day: one griller all day. */
  oneGrillerOnly: boolean;
  /** Most recent day first. */
  history: HistoryDay[];
  /** Injectable for deterministic tests. Defaults to Math.random. */
  random?: () => number;
}

export interface RotationResult {
  schedule: Schedule;
  /** Every position that appears in any slot today, in display order. */
  activePositions: Position[];
  /** True when the no-consecutive-hot rule had to be relaxed to fill the grid. */
  relaxed: boolean;
}

export const UNFILLED = 'UNFILLED';

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

export type Station = 'Grill' | 'P.O.S.' | 'Expo 1' | 'Expo 2' | 'Fries' | 'Lobby/Dish';

export function stationOf(position: Position): Station {
  if (position === 'Grill 1' || position === 'Grill 2') return 'Grill';
  if (position === 'Lobby/Dish 1' || position === 'Lobby/Dish 2') return 'Lobby/Dish';
  return position;
}

export function isHot(position: Position): boolean {
  const s = stationOf(position);
  return s === 'Grill' || s === 'Fries';
}

/** Preference for a position reads the station's preference (Grill 2 -> Grill 1). */
export function preferenceFor(preferences: PositionPreference[], position: Position): number {
  const station = stationOf(position);
  const lookup: Position = station === 'Grill' ? 'Grill 1' : station === 'Lobby/Dish' ? 'Lobby/Dish 1' : position;
  return preferences.find(p => p.position === lookup)?.preferenceLevel ?? 3;
}

// ---------------------------------------------------------------------------
// Staffing matrix: how many people are in today -> which positions each hour.
//
// A table, not branches, so "7 people, 1pm, no Grill 2" is a row you can read.
// Busy = 11am-12pm and 12pm-1pm; slow = 1pm-2pm.
// ---------------------------------------------------------------------------

type SlotKind = 'busy' | 'slow';

const NORMAL: Record<5 | 6 | 7 | 8, Record<SlotKind, Position[]>> = {
  5: {
    busy: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'],
    slow: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'],
  },
  6: {
    busy: ['P.O.S.', 'Grill 1', 'Grill 2', 'Expo 1', 'Expo 2', 'Fries'],
    slow: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'],
  },
  7: {
    busy: ['P.O.S.', 'Grill 1', 'Grill 2', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'],
    // Second griller stands down for the slow hour; the hands go to dish.
    slow: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'],
  },
  8: {
    busy: [...ALL_POSITIONS],
    slow: [...ALL_POSITIONS],
  },
};

const ONE_GRILLER: Record<5 | 6 | 7 | 8, Position[]> = {
  5: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2'],
  6: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1'],
  7: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'],
  8: ['P.O.S.', 'Grill 1', 'Expo 1', 'Fries', 'Expo 2', 'Lobby/Dish 1', 'Lobby/Dish 2'],
};

export const MIN_STAFF = 5;

export function positionsFor(headcount: number, slot: TimeSlot, oneGrillerOnly: boolean): Position[] {
  const key = Math.max(5, Math.min(8, headcount)) as 5 | 6 | 7 | 8;
  if (oneGrillerOnly) return [...ONE_GRILLER[key]];
  return [...NORMAL[key][slot === '1pm-2pm' ? 'slow' : 'busy']];
}

export function slotsForDuration(duration: DailyStaff['duration']): TimeSlot[] {
  switch (duration) {
    case '11-2pm': return ['11am-12pm', '12pm-1pm', '1pm-2pm'];
    case '11-1pm': return ['11am-12pm', '12pm-1pm'];
    case '12-2pm': return ['12pm-1pm', '1pm-2pm'];
    case '1-2pm': return ['1pm-2pm'];
  }
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

interface Cell {
  slot: TimeSlot;
  slotIndex: number;
  position: Position;
}

/** Everything the rules need to know about what has been placed so far. */
class Board {
  /** cell key -> staff id */
  readonly placed = new Map<string, string>();
  /** staff id -> set of slots they are already standing in */
  readonly busyIn = new Map<string, Set<TimeSlot>>();
  /** staff id -> stations worked today */
  readonly stationsToday = new Map<string, Set<Station>>();
  /** staff id -> slot indexes where they are hot */
  readonly hotAt = new Map<string, Set<number>>();

  place(cell: Cell, id: string): void {
    this.placed.set(key(cell), id);
    get(this.busyIn, id).add(cell.slot);
    get(this.stationsToday, id).add(stationOf(cell.position));
    if (isHot(cell.position)) get(this.hotAt, id).add(cell.slotIndex);
  }

  unplace(cell: Cell, id: string): void {
    this.placed.delete(key(cell));
    this.busyIn.get(id)?.delete(cell.slot);
    this.stationsToday.get(id)?.delete(stationOf(cell.position));
    if (isHot(cell.position)) this.hotAt.get(id)?.delete(cell.slotIndex);
  }

  hotCountToday(id: string): number {
    return this.hotAt.get(id)?.size ?? 0;
  }

  hotAdjacent(id: string, slotIndex: number): boolean {
    const at = this.hotAt.get(id);
    return !!at && (at.has(slotIndex - 1) || at.has(slotIndex + 1));
  }
}

const key = (c: Cell) => `${c.slot}|${c.position}`;
function get<K, V>(m: Map<K, Set<V>>, k: K): Set<V> {
  let s = m.get(k);
  if (!s) { s = new Set(); m.set(k, s); }
  return s;
}

/**
 * Depth-first fill of `cells` in order. `candidates(cell)` returns staff in
 * the order we would LIKE them, already filtered by the hard rules; the first
 * complete assignment found is therefore the greedy-preferred one, and the
 * search only runs deeper when greedy would strand a later cell.
 */
function solve(cells: Cell[], board: Board, candidates: (cell: Cell) => string[]): boolean {
  const step = (i: number): boolean => {
    if (i === cells.length) return true;
    const cell = cells[i];
    for (const id of candidates(cell)) {
      board.place(cell, id);
      if (step(i + 1)) return true;
      board.unplace(cell, id);
    }
    return false;
  };
  return step(0);
}

// ---------------------------------------------------------------------------
// History lookups
// ---------------------------------------------------------------------------

function recentHotShifts(history: HistoryDay[], id: string): number {
  let n = 0;
  for (const day of history) {
    for (const slot of TIME_SLOTS) {
      for (const a of day.schedule?.[slot] ?? []) {
        if (a.staffId === id && isHot(a.position)) n++;
      }
    }
  }
  return n;
}

function recentStationShifts(history: HistoryDay[], id: string, station: Station): number {
  let n = 0;
  for (const day of history) {
    for (const slot of TIME_SLOTS) {
      for (const a of day.schedule?.[slot] ?? []) {
        if (a.staffId === id && stationOf(a.position) === station) n++;
      }
    }
  }
  return n;
}

function workedSameSlotYesterday(history: HistoryDay[], id: string, cell: Cell): boolean {
  const yesterday = history[0]?.schedule?.[cell.slot] ?? [];
  return yesterday.some(a => a.staffId === id && stationOf(a.position) === stationOf(cell.position));
}

// ---------------------------------------------------------------------------
// The rotation
// ---------------------------------------------------------------------------

export function generateRotation(input: RotationInput): RotationResult {
  const { staff, grillOpener, oneGrillerOnly, history } = input;
  const random = input.random ?? Math.random;
  const byId = new Map(staff.map(s => [s.id, s]));

  const cells: Cell[] = [];
  TIME_SLOTS.forEach((slot, slotIndex) => {
    for (const position of positionsFor(staff.length, slot, oneGrillerOnly)) {
      cells.push({ slot, slotIndex, position });
    }
  });
  const hotCells = cells.filter(c => isHot(c.position));
  const coldCells = cells.filter(c => !isHot(c.position));

  const board = new Board();

  // Jitter is fixed per (person, cell) for the whole search so backtracking
  // sees a stable ordering. It is strictly smaller than any real key.
  const jitter = new Map<string, number>();
  const jit = (id: string, cell: Cell) => {
    const k = `${id}|${key(cell)}`;
    if (!jitter.has(k)) jitter.set(k, random());
    return jitter.get(k)!;
  };

  const baseEligible = (id: string, cell: Cell): boolean => {
    const s = byId.get(id)!;
    if (!s.availableSlots.includes(cell.slot)) return false;
    if (board.busyIn.get(id)?.has(cell.slot)) return false;
    if (board.stationsToday.get(id)?.has(stationOf(cell.position))) return false;
    return true;
  };

  // Pass 1: hot stations, whole day. Fewest hot today, then fewest over 7
  // days, then preference, then jitter.
  const hotCandidates = (allowConsecutive: boolean) => (cell: Cell): string[] =>
    staff
      .filter(s => baseEligible(s.id, cell))
      .filter(s => !(s.id === grillOpener && cell.slotIndex === 0))
      .filter(s => allowConsecutive || !board.hotAdjacent(s.id, cell.slotIndex))
      .map(s => ({
        id: s.id,
        k: [
          board.hotCountToday(s.id),
          recentHotShifts(history, s.id),
          -preferenceFor(s.preferences, cell.position),
          jit(s.id, cell),
        ],
      }))
      .sort((a, b) => compare(a.k, b.k))
      .map(c => c.id);

  let relaxed = false;
  if (!solve(hotCells, board, hotCandidates(false))) {
    // Could not keep rule 2 for every cell. Start over without it rather
    // than leave a partial board behind; rules 1, 3 and 4 still hold.
    relaxed = true;
    for (const c of hotCells) {
      const id = board.placed.get(key(c));
      if (id) board.unplace(c, id);
    }
    solve(hotCells, board, hotCandidates(true));
  }

  // Pass 2: everything else, by preference. Per slot, so an unfillable cell
  // in one hour cannot block the others.
  const coldCandidates = (cell: Cell): string[] =>
    staff
      .filter(s => baseEligible(s.id, cell))
      .map(s => ({
        id: s.id,
        k: [
          -preferenceFor(s.preferences, cell.position),
          workedSameSlotYesterday(history, s.id, cell) ? 1 : 0,
          recentStationShifts(history, s.id, stationOf(cell.position)),
          jit(s.id, cell),
        ],
      }))
      .sort((a, b) => compare(a.k, b.k))
      .map(c => c.id);

  for (const slot of TIME_SLOTS) {
    const slotCells = coldCells.filter(c => c.slot === slot);
    if (!solve(slotCells, board, coldCandidates)) {
      // Fill what can be filled; the rest shows as UNFILLED.
      for (const c of slotCells) {
        if (board.placed.has(key(c))) continue;
        const pick = coldCandidates(c)[0];
        if (pick) board.place(c, pick);
      }
    }
  }

  const schedule = { '11am-12pm': [], '12pm-1pm': [], '1pm-2pm': [] } as Schedule;
  for (const c of cells) {
    const id = board.placed.get(key(c));
    schedule[c.slot].push(
      id
        ? { position: c.position, staffName: byId.get(id)!.name, staffId: id }
        : { position: c.position, staffName: UNFILLED, staffId: '' },
    );
  }

  const seen = new Set<Position>();
  const activePositions = cells.map(c => c.position).filter(p => !seen.has(p) && seen.add(p));

  return { schedule, activePositions, relaxed };
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
