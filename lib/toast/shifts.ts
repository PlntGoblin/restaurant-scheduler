/**
 * Toast shifts -> the scheduler's lunch-rush roster. Pure functions only:
 * no fetch, no env, no clock. Everything here is unit-testable, which is the
 * whole point -- the subtleties below were all learned the expensive way.
 */

import { DailyStaff } from '@/lib/types';
import {
  LocalParts,
  dateKey,
  hhmm,
  minutesOfDay,
  minutesToHHMM,
  toLocalParts,
} from './time';

/** A shift as the Toast Labor API returns it (fields we actually read). */
export interface ToastShift {
  guid?: string;
  deleted?: boolean;
  inDate: string;
  outDate: string;
  employeeReference?: { guid?: string } | null;
  jobReference?: { guid?: string } | null;
}

/** A Toast shift resolved into restaurant-local terms. */
export interface LocalShift {
  guid: string | null;
  employeeGuid: string | null;
  /** Local calendar date of the shift START. See `shiftToLocal`. */
  date: string;
  inHHMM: string;
  outHHMM: string;
  inMinutes: number;
  /** Minutes since the START day's midnight; >1440 for a shift past midnight. */
  outMinutes: number;
}

export type Duration = DailyStaff['duration'];

/** Lunch rush, in minutes since local midnight. */
export const LUNCH_START_MIN = 11 * 60; // 11:00
export const LUNCH_END_MIN = 14 * 60;   // 14:00

/**
 * The four buckets the Dashboard dropdown offers, as minute windows.
 *
 * Iteration order is the tie-break order, so it is deliberate: the widest
 * window first, so a shift that genuinely covers the whole rush can never
 * lose to a narrower bucket on an exact score tie.
 */
export const DURATION_WINDOWS: ReadonlyArray<readonly [Duration, number, number]> = [
  ['11-2pm', 660, 840],
  ['11-1pm', 660, 780],
  ['12-2pm', 720, 840],
  ['1-2pm', 780, 840],
];

/** Below this overlap score, the bucket is a lossy guess and says so. */
export const CONFIDENCE_THRESHOLD = 0.75;

/** A shift starting at or before 10:00 local could be the grill opener. */
export const GRILL_OPENER_LATEST_START_MIN = 10 * 60;

/**
 * One Toast shift -> local terms.
 *
 * `date` is the local calendar date of the shift's START, which is what "who
 * is on today" means to a human. A closing shift running to 04:00 UTC belongs
 * to the evening before, not to tomorrow morning -- file it by `outDate` and
 * every closer silently moves a day.
 *
 * `outMinutes` is measured from the START day's midnight, so a shift crossing
 * midnight reads as e.g. 1380 -> 1500 rather than wrapping back to 60 and
 * looking like a zero-length shift.
 */
export function shiftToLocal(shift: ToastShift): LocalShift {
  const inParts: LocalParts = toLocalParts(shift.inDate);
  const outParts: LocalParts = toLocalParts(shift.outDate);
  const inMinutes = minutesOfDay(inParts);
  const dayShift = dateKey(outParts) === dateKey(inParts) ? 0 : 1440;

  return {
    guid: shift.guid ?? null,
    employeeGuid: shift.employeeReference?.guid ?? null,
    date: dateKey(inParts),
    inHHMM: hhmm(inParts),
    outHHMM: hhmm(outParts),
    inMinutes,
    outMinutes: minutesOfDay(outParts) + dayShift,
  };
}

/**
 * The portion of a shift that falls inside the lunch rush, or null if none
 * of it does. Prep crew arriving at 07:00 and closers leaving at 21:00 are
 * both real shifts the scheduler has no opinion about.
 */
export function clampToLunch(
  inMinutes: number,
  outMinutes: number,
): [number, number] | null {
  const start = Math.max(inMinutes, LUNCH_START_MIN);
  const end = Math.min(outMinutes, LUNCH_END_MIN);
  return end > start ? [start, end] : null;
}

export interface DurationMatch {
  duration: Duration;
  /** False when the bucket is a visibly lossy fit -- surface it in the UI. */
  confident: boolean;
  /** Overlap-over-union of the clamped shift against the chosen bucket. */
  score: number;
  /** The lunch-window slice we actually matched, e.g. "11:00-12:00". */
  clamped: string;
}

/**
 * Pick the dropdown bucket that best describes a shift's lunch overlap.
 *
 * Scored by overlap-over-union rather than start-time proximity: a 12:00-20:00
 * shift and a 12:00-12:30 shift share a start but mean very different things,
 * and only the former is really a '12-2pm'.
 *
 * Four fixed buckets cannot represent every real shift -- an 11:00-12:00 is
 * not any of them. Rather than pretend, those come back `confident: false` so
 * the Dashboard can flag the row and show the real Toast times next to it.
 */
export function durationForShift(
  inMinutes: number,
  outMinutes: number,
): DurationMatch | null {
  const clamped = clampToLunch(inMinutes, outMinutes);
  if (!clamped) return null;
  const [cs, ce] = clamped;

  let best: Duration = DURATION_WINDOWS[0][0];
  let bestScore = -1;

  for (const [duration, ws, we] of DURATION_WINDOWS) {
    const overlap = Math.max(0, Math.min(ce, we) - Math.max(cs, ws));
    const union = Math.max(ce, we) - Math.min(cs, ws);
    const score = union > 0 ? overlap / union : 0;
    if (score > bestScore) {
      bestScore = score;
      best = duration;
    }
  }

  return {
    duration: best,
    confident: bestScore >= CONFIDENCE_THRESHOLD,
    score: Math.round(bestScore * 100) / 100,
    clamped: `${minutesToHHMM(cs)}-${minutesToHHMM(ce)}`,
  };
}

/** Did this shift start early enough to have cooked meat before open? */
export function isGrillOpenerCandidate(inMinutes: number): boolean {
  return inMinutes <= GRILL_OPENER_LATEST_START_MIN;
}

/** What `/api/toast/shifts` hands the browser for one shift. */
export interface ToastShiftDTO {
  guid: string | null;
  employeeGuid: string | null;
  date: string;
  /** Real Toast times, always shown for a non-confident mapping. */
  raw: string;
  duration: Duration;
  confident: boolean;
  score: number;
  clamped: string;
  openerCandidate: boolean;
}

/**
 * Raw Toast shifts -> the lunch-relevant DTOs for one local date.
 *
 * Drops, in order: deleted shifts, shifts whose local start date isn't the one
 * asked for (the window is local midnight to local midnight, but filtering on
 * our own parsed date is what actually guarantees the closing-shift rule), and
 * shifts with no lunch overlap at all.
 */
export function lunchShiftsForDate(
  shifts: ToastShift[],
  date: string,
): ToastShiftDTO[] {
  const out: ToastShiftDTO[] = [];

  for (const raw of shifts) {
    if (raw?.deleted) continue;
    if (!raw?.inDate || !raw?.outDate) continue;

    const local = shiftToLocal(raw);
    if (local.date !== date) continue;

    const match = durationForShift(local.inMinutes, local.outMinutes);
    if (!match) continue;

    out.push({
      guid: local.guid,
      employeeGuid: local.employeeGuid,
      date: local.date,
      raw: `${local.inHHMM}-${local.outHHMM}`,
      duration: match.duration,
      confident: match.confident,
      score: match.score,
      clamped: match.clamped,
      openerCandidate: isGrillOpenerCandidate(local.inMinutes),
    });
  }

  return out.sort((a, b) => a.raw.localeCompare(b.raw));
}

/** A clock-in record from the Labor API (fields we read). */
export interface ToastTimeEntry {
  guid?: string;
  deleted?: boolean;
  inDate: string;
  outDate?: string | null;
  employeeReference?: { guid?: string } | null;
  shiftReference?: { guid?: string } | null;
}

export interface ToastTimeEntryDTO {
  guid: string | null;
  employeeGuid: string | null;
  shiftGuid: string | null;
  date: string;
  inHHMM: string;
  outHHMM: string | null;
  inMinutes: number;
  /** True while someone is still on the clock. */
  stillClockedIn: boolean;
}

/**
 * Raw time entries -> DTOs for one local date.
 *
 * Roughly half of these carry no `shiftReference`: those are unscheduled
 * clock-ins, which are a normal thing that happens in a restaurant and not
 * an error to be filtered out. An open entry (no `outDate`) means the person
 * is on the clock right now, which is the most useful state of all at 10:45.
 */
export function timeEntriesForDate(
  entries: ToastTimeEntry[],
  date: string,
): ToastTimeEntryDTO[] {
  const out: ToastTimeEntryDTO[] = [];

  for (const raw of entries) {
    if (raw?.deleted) continue;
    if (!raw?.inDate) continue;

    const inParts = toLocalParts(raw.inDate);
    if (dateKey(inParts) !== date) continue;

    out.push({
      guid: raw.guid ?? null,
      employeeGuid: raw.employeeReference?.guid ?? null,
      shiftGuid: raw.shiftReference?.guid ?? null,
      date: dateKey(inParts),
      inHHMM: hhmm(inParts),
      outHHMM: raw.outDate ? hhmm(toLocalParts(raw.outDate)) : null,
      inMinutes: minutesOfDay(inParts),
      stillClockedIn: !raw.outDate,
    });
  }

  return out.sort((a, b) => a.inMinutes - b.inMinutes);
}
