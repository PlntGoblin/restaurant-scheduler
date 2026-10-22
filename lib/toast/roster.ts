/**
 * Client-side helpers shared by the Toast Link screen and the Dashboard:
 * reading the staff roster out of localStorage, resolving Toast GUIDs to
 * staff members, and building the pull diff.
 *
 * Pure except for the two localStorage accessors, which are confined here so
 * both screens use the same key and the same shape. `'staff'` is the key
 * StaffManagement and Dashboard have always used; nothing about that changes.
 */

import { ALL_POSITIONS } from '@/lib/constants';
import { DailyStaff, StaffMember } from '@/lib/types';
import type { ToastShiftDTO } from './shifts';
import type { ToastEmployeeDTO } from './match';

export const STAFF_KEY = 'staff';

export function loadStaff(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StaffMember[]) : [];
  } catch {
    // A corrupt roster should not blank the screen; the caller shows the
    // "no staff found" state and Staff Management can rebuild it.
    return [];
  }
}

export function saveStaff(staff: StaffMember[]): void {
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
}

/** GUID -> staff member, for resolving a Toast shift to a person. */
export function guidIndex(staff: StaffMember[]): Map<string, StaffMember> {
  const index = new Map<string, StaffMember>();
  for (const s of staff) {
    for (const guid of s.toastGuids ?? []) index.set(guid, s);
  }
  return index;
}

/**
 * A new staff member for a Toast employee nobody has in the roster yet.
 *
 * Qualified on everything at preference 3 and available every day: neutral
 * defaults that make them immediately schedulable, which is the point -- a
 * new hire should not block tomorrow's pull. Preferences get tuned in Staff
 * Management once someone knows what they are actually good at.
 */
export function staffFromToastEmployee(employee: ToastEmployeeDTO): StaffMember {
  return {
    id: `toast-${employee.guid}`,
    name: employee.displayName,
    positions: [...ALL_POSITIONS],
    preferences: ALL_POSITIONS.map((position) => ({ position, preferenceLevel: 3 as const })),
    availability: ([0, 1, 2, 3, 4, 5, 6] as const).map((dayOfWeek) => ({
      dayOfWeek,
      available: true,
    })),
    seniority: 'Team Member',
    toastGuids: [employee.guid],
  };
}

export interface RosterDiff {
  /** On Toast's schedule, not currently on the roster. */
  added: DailyStaff[];
  /** On the roster, not on Toast's schedule for this date. */
  removed: DailyStaff[];
  /** On both, but Toast says a different duration. */
  changed: { staff: DailyStaff; from: DailyStaff['duration']; to: DailyStaff['duration'] }[];
  /** Unchanged rows, carried through so `next` is the complete roster. */
  unchanged: DailyStaff[];
  /** The roster as it would be after applying. */
  next: DailyStaff[];
  /** Toast shifts whose employee GUID matches nobody in the roster. */
  unlinked: ToastShiftDTO[];
  /** staffId -> the mapped shift, for the warning chips. */
  shiftByStaffId: Map<string, ToastShiftDTO>;
  /** Everyone on the clock before the rush, earliest first. */
  openerCandidates: { staffId: string; name: string; startHHMM: string }[];
  /**
   * Pre-fill for the grill opener: of everyone on the clock by 10am, the one
   * who most prefers Grill; ties go to the latest start. See `buildRosterDiff`.
   */
  suggestedGrillOpenerId: string | null;
}

/**
 * Compare Toast's shifts for a date against the roster currently on screen.
 *
 * Returns a diff rather than just the new roster, because the manager may
 * have already hand-edited today -- someone swapped in, someone sent home -
 * and silently overwriting that is how an auto-fill stops being trusted. The
 * Dashboard shows this and asks before applying.
 *
 * Shifts whose GUID resolves to nobody become `unlinked` and are NAMED in the
 * UI. They are never quietly dropped: an unlinked person is someone who IS
 * working and would otherwise just be missing from the schedule.
 */
export function buildRosterDiff(
  shifts: ToastShiftDTO[],
  currentRoster: DailyStaff[],
  staff: StaffMember[],
): RosterDiff {
  const byGuid = guidIndex(staff);
  const currentById = new Map(currentRoster.map((r) => [r.id, r]));

  const unlinked: ToastShiftDTO[] = [];
  const shiftByStaffId = new Map<string, ToastShiftDTO>();
  const fromToast: DailyStaff[] = [];

  for (const shift of shifts) {
    const member = shift.employeeGuid ? byGuid.get(shift.employeeGuid) : undefined;
    if (!member) {
      unlinked.push(shift);
      continue;
    }
    // One person with two lunch-overlapping shifts in a day (a split) keeps
    // the earlier one; `shifts` arrives sorted by start time.
    if (shiftByStaffId.has(member.id)) continue;
    shiftByStaffId.set(member.id, shift);
    fromToast.push({ id: member.id, name: member.name, duration: shift.duration });
  }

  const toastIds = new Set(fromToast.map((r) => r.id));
  const added: DailyStaff[] = [];
  const changed: RosterDiff['changed'] = [];
  const unchanged: DailyStaff[] = [];

  for (const row of fromToast) {
    const existing = currentById.get(row.id);
    if (!existing) added.push(row);
    else if (existing.duration !== row.duration) {
      changed.push({ staff: row, from: existing.duration, to: row.duration });
    } else unchanged.push(row);
  }

  const removed = currentRoster.filter((r) => !toastIds.has(r.id));

  // Who opened the grill is not in the Toast feed: jobReference is the
  // person's SENIORITY ("Team Member", "Captain 1"), not their station, so
  // nothing in the API distinguishes the 7am prep crew from whoever cooked
  // the meat. What this app DOES know is each person's Grill preference from
  // Staff Management -- the same number the rotation already trusts.
  //
  // So the pick is: of everyone on the clock by 10am, whoever most prefers
  // Grill. Ties go to the LATEST start -- meat is cooked in the 9-10am
  // window, and the earliest starts are reliably the prep crew. On a roster
  // where preferences were never filled in, everything is a tie and the rule
  // degrades to exactly "the 9am person".
  //
  // It is a pre-fill, not a verdict: the Dashboard never overwrites a
  // selection a person already made for today.
  const openerCandidates = [...shiftByStaffId.entries()]
    .filter(([, shift]) => shift.openerCandidate)
    .map(([staffId, shift]) => ({
      staffId,
      name: fromToast.find((r) => r.id === staffId)?.name ?? staffId,
      startHHMM: shift.raw.split('-')[0],
    }))
    .sort((a, b) => toMinutes(a.startHHMM) - toMinutes(b.startHHMM));

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const grillPreference = (staffId: string): number => {
    const prefs = staffById.get(staffId)?.preferences ?? [];
    return prefs.find((p) => p.position === 'Grill 1')?.preferenceLevel ?? 3;
  };
  const suggestedGrillOpenerId =
    openerCandidates.length > 0
      ? [...openerCandidates].sort(
          (a, b) =>
            grillPreference(b.staffId) - grillPreference(a.staffId) ||
            toMinutes(b.startHHMM) - toMinutes(a.startHHMM),
        )[0].staffId
      : null;

  return {
    added,
    removed,
    changed,
    unchanged,
    next: fromToast,
    unlinked,
    shiftByStaffId,
    openerCandidates,
    suggestedGrillOpenerId,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface ClockInReconcile {
  /** Scheduled, past their start time, and never clocked in. */
  possibleNoShows: DailyStaff[];
  /** Clocked in but not on the roster. */
  unscheduled: { staff: StaffMember; inHHMM: string }[];
  /** Clocked-in GUIDs matching nobody in the roster. */
  unlinkedGuids: string[];
}

/**
 * Compare actual clock-ins against the roster on screen.
 *
 * `nowMinutes` is passed in rather than read from the clock so this stays
 * pure and testable, and so the comparison uses RESTAURANT-local time -- a
 * manager checking from a different timezone would otherwise see everyone as
 * a no-show, or nobody.
 *
 * Suggestions only. Nothing here applies itself: a person who clocked in two
 * minutes late is not a no-show, and only a human on the floor knows that.
 */
export function reconcileClockIns(
  roster: DailyStaff[],
  entries: { employeeGuid: string | null; inHHMM: string; inMinutes: number }[],
  staff: StaffMember[],
  nowMinutes: number,
  shiftByStaffId: Map<string, ToastShiftDTO>,
): ClockInReconcile {
  const byGuid = guidIndex(staff);
  const clockedInStaffIds = new Set<string>();
  // A Set, not an array: one person can clock in and out several times in a
  // day (a break), and counting entries would report two unmatched PEOPLE
  // where there is one.
  const unlinked = new Set<string>();
  const unscheduled: ClockInReconcile['unscheduled'] = [];
  const rosterIds = new Set(roster.map((r) => r.id));

  for (const entry of entries) {
    const member = entry.employeeGuid ? byGuid.get(entry.employeeGuid) : undefined;
    if (!member) {
      if (entry.employeeGuid) unlinked.add(entry.employeeGuid);
      continue;
    }
    clockedInStaffIds.add(member.id);
    // Same reason: only offer to add a person once, however many entries
    // they have.
    if (!rosterIds.has(member.id) && !unscheduled.some((u) => u.staff.id === member.id)) {
      unscheduled.push({ staff: member, inHHMM: entry.inHHMM });
    }
  }

  const possibleNoShows = roster.filter((row) => {
    if (clockedInStaffIds.has(row.id)) return false;
    const shift = shiftByStaffId.get(row.id);
    // Without a Toast shift to read a start time from, fall back to the
    // start of the rush -- the roster row still came from somewhere.
    const start = shift ? toMinutes(shift.raw.split('-')[0]) : 11 * 60;
    return nowMinutes > start;
  });

  return { possibleNoShows, unscheduled, unlinkedGuids: [...unlinked] };
}

/**
 * Is it safe to apply Toast's answer without asking a person first?
 *
 * Two ways the answer is no, both learned the hard way on 2026-10-20 when a
 * production roster was silently emptied:
 *
 *  1. The roster carries a human's edits -- or carries NO provenance marker
 *     at all, which means the same thing. Every roster built before this
 *     feature existed has no marker, and reading "no marker" as "untouched"
 *     is what did the damage. Unknown provenance is a person's work until
 *     proven otherwise.
 *
 *  2. Applying would empty a roster that has people in it. That is never a
 *     routine refresh: in practice it means nobody is linked to Toast yet, so
 *     Toast's answer is empty through no fault of the schedule, and applying
 *     it deletes a real roster to match a lie.
 */
export function needsConfirmation(opts: {
  /** True when a person edited this roster, OR provenance is unknown. */
  edited: boolean;
  /** How many people Toast says are on. */
  nextCount: number;
  /** How many are on the roster right now. */
  currentCount: number;
}): boolean {
  if (opts.edited) return true;
  return opts.nextCount === 0 && opts.currentCount > 0;
}

/**
 * Whether a stored roster may be auto-replaced from Toast.
 *
 * `meta` is null for any roster written before provenance was tracked. A
 * non-empty roster with no marker is somebody's work; an empty one has
 * nothing to lose.
 */
export function isRosterProtected(
  meta: { date: string; edited: boolean } | null,
  date: string,
  rosterCount: number,
): boolean {
  if (!meta) return rosterCount > 0;
  return meta.edited && meta.date === date;
}
