import { describe, expect, it } from 'vitest';
import {
  buildRosterDiff,
  isRosterProtected,
  needsConfirmation,
  reconcileClockIns,
  staffFromToastEmployee,
} from '../roster';
import { toEmployeeDTO } from '../match';
import type { ToastShiftDTO } from '../shifts';
import type { DailyStaff, StaffMember } from '@/lib/types';

const member = (id: string, name: string, guids: string[]): StaffMember => ({
  id,
  name,
  positions: [],
  preferences: [],
  availability: [],
  seniority: 'Team Member',
  toastGuids: guids,
});

const toastShift = (
  employeeGuid: string | null,
  duration: ToastShiftDTO['duration'],
  raw: string,
  overrides: Partial<ToastShiftDTO> = {},
): ToastShiftDTO => ({
  guid: `s-${employeeGuid}-${raw}`,
  employeeGuid,
  date: '2026-08-20',
  raw,
  duration,
  confident: true,
  score: 1,
  clamped: raw,
  openerCandidate: false,
  ...overrides,
});

const row = (id: string, name: string, duration: DailyStaff['duration']): DailyStaff =>
  ({ id, name, duration });

describe('staffFromToastEmployee', () => {
  it('creates someone schedulable today, not a blank record', () => {
    const s = staffFromToastEmployee(toEmployeeDTO({ guid: 'g1', firstName: 'New', lastName: 'Hire' }));
    expect(s.toastGuids).toEqual(['g1']);
    expect(s.positions.length).toBeGreaterThan(0);
    expect(s.preferences.every((p) => p.preferenceLevel === 3)).toBe(true);
    expect(s.availability).toHaveLength(7);
    expect(s.seniority).toBe('Team Member');
  });
});

describe('buildRosterDiff', () => {
  const staff = [member('s1', 'Toni', ['g1']), member('s2', 'Jake', ['g2']), member('s3', 'Dana', ['g3'])];

  it('classifies added, removed, changed and unchanged', () => {
    const diff = buildRosterDiff(
      [toastShift('g1', '11-2pm', '11:00-14:00'), toastShift('g2', '12-2pm', '12:00-20:00')],
      [row('s1', 'Toni', '11-2pm'), row('s3', 'Dana', '1-2pm')],
      staff,
    );
    expect(diff.unchanged.map((r) => r.id)).toEqual(['s1']);
    expect(diff.added.map((r) => r.id)).toEqual(['s2']);
    expect(diff.removed.map((r) => r.id)).toEqual(['s3']);
    expect(diff.next.map((r) => r.id)).toEqual(['s1', 's2']);
  });

  it('reports a duration Toast disagrees with rather than overwriting silently', () => {
    const diff = buildRosterDiff(
      [toastShift('g1', '12-2pm', '12:00-14:00')],
      [row('s1', 'Toni', '11-2pm')],
      staff,
    );
    expect(diff.changed).toEqual([{ staff: row('s1', 'Toni', '12-2pm'), from: '11-2pm', to: '12-2pm' }]);
  });

  it('names an unlinked shift instead of dropping the person', () => {
    const diff = buildRosterDiff(
      [toastShift('unknown-guid', '11-2pm', '11:00-14:00'), toastShift('g1', '11-2pm', '11:00-14:00')],
      [],
      staff,
    );
    expect(diff.unlinked).toHaveLength(1);
    expect(diff.unlinked[0].employeeGuid).toBe('unknown-guid');
    expect(diff.next.map((r) => r.id)).toEqual(['s1']);
  });

  it('treats a shift with no employee reference as unlinked', () => {
    const diff = buildRosterDiff([toastShift(null, '11-2pm', '11:00-14:00')], [], staff);
    expect(diff.unlinked).toHaveLength(1);
    expect(diff.next).toEqual([]);
  });

  it('keeps the earlier of a split shift and does not duplicate the person', () => {
    const diff = buildRosterDiff(
      [toastShift('g1', '11-1pm', '11:00-13:00'), toastShift('g1', '1-2pm', '13:00-14:00')],
      [],
      staff,
    );
    expect(diff.next).toHaveLength(1);
    expect(diff.next[0].duration).toBe('11-1pm');
  });

  it('pre-fills the grill opener when exactly one person came in early', () => {
    const diff = buildRosterDiff(
      [
        toastShift('g1', '11-2pm', '09:00-14:00', { openerCandidate: true }),
        toastShift('g2', '11-2pm', '11:00-14:00'),
      ],
      [],
      staff,
    );
    expect(diff.suggestedGrillOpenerId).toBe('s1');
    expect(diff.openerCandidates.map((c) => c.staffId)).toEqual(['s1']);
  });

  it('refuses to guess the opener when several people came in early', () => {
    // A real Forefathers morning: a 7am opening-prep crew plus whoever cooked
    // meat at 9. Toast's jobReference is seniority, not station, so nothing
    // in the data says which one is the grill opener -- and picking the
    // earliest would reliably name the prep crew instead.
    const diff = buildRosterDiff(
      [
        toastShift('g1', '11-2pm', '09:00-14:00', { openerCandidate: true }),
        toastShift('g2', '11-2pm', '07:00-14:00', { openerCandidate: true }),
        toastShift('g3', '11-2pm', '11:00-14:00'),
      ],
      [],
      staff,
    );
    expect(diff.suggestedGrillOpenerId).toBeNull();
    // ...but it hands over the candidates, earliest first, for a human to pick.
    expect(diff.openerCandidates).toEqual([
      { staffId: 's2', name: 'Jake', startHHMM: '07:00' },
      { staffId: 's1', name: 'Toni', startHHMM: '09:00' },
    ]);
  });

  it('suggests no opener and offers nobody when the whole crew starts at 11', () => {
    const diff = buildRosterDiff([toastShift('g1', '11-2pm', '11:00-14:00')], [], staff);
    expect(diff.suggestedGrillOpenerId).toBeNull();
    expect(diff.openerCandidates).toEqual([]);
  });

  it('exposes the mapped shift per staff id for the warning chips', () => {
    const diff = buildRosterDiff(
      [toastShift('g1', '11-1pm', '11:00-12:00', { confident: false, score: 0.5 })],
      [],
      staff,
    );
    expect(diff.shiftByStaffId.get('s1')?.confident).toBe(false);
  });
});

describe('reconcileClockIns', () => {
  const staff = [member('s1', 'Toni', ['g1']), member('s2', 'Jake', ['g2']), member('s3', 'Dana', ['g3'])];
  const shiftByStaffId = new Map<string, ToastShiftDTO>([
    ['s1', toastShift('g1', '11-2pm', '11:00-14:00')],
    ['s2', toastShift('g2', '1-2pm', '13:00-14:00')],
  ]);

  it('flags someone past their start who never clocked in', () => {
    const r = reconcileClockIns(
      [row('s1', 'Toni', '11-2pm'), row('s2', 'Jake', '1-2pm')],
      [{ employeeGuid: 'g2', inHHMM: '12:58', inMinutes: 778 }],
      staff,
      13 * 60 + 30,
      shiftByStaffId,
    );
    expect(r.possibleNoShows.map((p) => p.id)).toEqual(['s1']);
  });

  it('does not call someone a no-show before their shift starts', () => {
    const r = reconcileClockIns(
      [row('s2', 'Jake', '1-2pm')],
      [],
      staff,
      11 * 60 + 15, // Jake is not due until 13:00
      shiftByStaffId,
    );
    expect(r.possibleNoShows).toEqual([]);
  });

  it('surfaces an unscheduled arrival as someone to add', () => {
    const r = reconcileClockIns(
      [row('s1', 'Toni', '11-2pm')],
      [
        { employeeGuid: 'g1', inHHMM: '10:55', inMinutes: 655 },
        { employeeGuid: 'g3', inHHMM: '11:05', inMinutes: 665 },
      ],
      staff,
      11 * 60 + 30,
      shiftByStaffId,
    );
    expect(r.unscheduled.map((u) => u.staff.id)).toEqual(['s3']);
    expect(r.unscheduled[0].inHHMM).toBe('11:05');
    expect(r.possibleNoShows).toEqual([]);
  });

  it('counts a person who clocked in twice as one, not two', () => {
    // Someone clocking out for a break and back in produces two entries.
    // Counting entries would report two unmatched people where there is one,
    // and would offer to add the same person to the roster twice.
    const r = reconcileClockIns(
      [],
      [
        { employeeGuid: 'mystery', inHHMM: '11:00', inMinutes: 660 },
        { employeeGuid: 'mystery', inHHMM: '12:30', inMinutes: 750 },
        { employeeGuid: 'g3', inHHMM: '11:00', inMinutes: 660 },
        { employeeGuid: 'g3', inHHMM: '12:30', inMinutes: 750 },
      ],
      staff,
      13 * 60,
      shiftByStaffId,
    );
    expect(r.unlinkedGuids).toEqual(['mystery']);
    expect(r.unscheduled.map((u) => u.staff.id)).toEqual(['s3']);
  });

  it('reports a clocked-in GUID belonging to nobody linked', () => {
    const r = reconcileClockIns(
      [],
      [{ employeeGuid: 'mystery', inHHMM: '11:00', inMinutes: 660 }],
      staff,
      12 * 60,
      shiftByStaffId,
    );
    expect(r.unlinkedGuids).toEqual(['mystery']);
  });
});

describe('isRosterProtected', () => {
  it('protects a roster with no provenance marker', () => {
    // THE 2026-10-20 PRODUCTION BUG. Every roster built before provenance
    // was tracked has no marker. Reading that as "untouched" let the first
    // auto-pull silently replace a hand-built roster with Toast's answer.
    expect(isRosterProtected(null, '2026-10-21', 7)).toBe(true);
  });

  it('does not protect an empty roster with no marker', () => {
    // Nothing to lose, so filling it in is the whole point of the feature.
    expect(isRosterProtected(null, '2026-10-21', 0)).toBe(false);
  });

  it('protects a roster a person edited today', () => {
    expect(isRosterProtected({ date: '2026-10-21', edited: true }, '2026-10-21', 5)).toBe(true);
  });

  it('does not protect a roster this code wrote from Toast', () => {
    expect(isRosterProtected({ date: '2026-10-21', edited: false }, '2026-10-21', 5)).toBe(false);
  });

  it('does not carry yesterday’s edits forward to today', () => {
    expect(isRosterProtected({ date: '2026-10-20', edited: true }, '2026-10-21', 5)).toBe(false);
  });
});

describe('needsConfirmation', () => {
  it('asks before emptying a roster that has people in it', () => {
    // Toast returning nobody almost always means nobody is linked yet, not
    // that every shift was cancelled. Applying it deletes a real roster.
    expect(needsConfirmation({ edited: false, nextCount: 0, currentCount: 7 })).toBe(true);
  });

  it('applies silently when filling an empty roster', () => {
    expect(needsConfirmation({ edited: false, nextCount: 7, currentCount: 0 })).toBe(false);
  });

  it('applies silently when refreshing an untouched Toast roster', () => {
    expect(needsConfirmation({ edited: false, nextCount: 6, currentCount: 7 })).toBe(false);
  });

  it('always asks once a person has edited', () => {
    expect(needsConfirmation({ edited: true, nextCount: 7, currentCount: 7 })).toBe(true);
  });

  it('does not fuss over an empty roster staying empty', () => {
    expect(needsConfirmation({ edited: false, nextCount: 0, currentCount: 0 })).toBe(false);
  });
});
