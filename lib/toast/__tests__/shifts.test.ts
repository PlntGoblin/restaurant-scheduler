import { describe, expect, it } from 'vitest';
import {
  clampToLunch,
  durationForShift,
  isGrillOpenerCandidate,
  lunchShiftsForDate,
  shiftToLocal,
  timeEntriesForDate,
  type ToastShift,
  formatHHMM,
  formatRawRange,
} from '../shifts';

/** A shift expressed in Phoenix-local hours, as the UTC instants Toast sends. */
function shift(day: number, inHour: number, outHour: number, extra: Partial<ToastShift> = {}): ToastShift {
  const stamp = (hour: number) => {
    // +7h is the Phoenix offset; real date math so any local hour >= 17
    // correctly rolls past midnight UTC.
    const d = new Date(Date.UTC(2026, 7, day, hour + 7, 0, 0));
    return `${d.toISOString().slice(0, 23)}+0000`;
  };
  return {
    guid: `t-${day}-${inHour}`,
    employeeReference: { guid: 'emp-1' },
    inDate: stamp(inHour),
    outDate: stamp(outHour),
    ...extra,
  };
}

describe('shiftToLocal', () => {
  it('files a closing shift under the evening it started, not the next morning', () => {
    // 01:00-04:00 UTC is 18:00-21:00 the previous day in Phoenix. "Who is on
    // tonight" must mean tonight.
    const local = shiftToLocal({
      guid: 'g',
      employeeReference: { guid: 'e' },
      inDate: '2026-08-20T01:00:00.000+0000',
      outDate: '2026-08-20T04:00:00.000+0000',
    });
    expect(local.date).toBe('2026-08-19');
    expect(local.inHHMM).toBe('18:00');
    expect(local.outHHMM).toBe('21:00');
  });

  it('measures a past-midnight end from the start day, not back around to morning', () => {
    const local = shiftToLocal({
      inDate: '2026-08-21T05:00:00.000+0000', // 22:00 local on the 20th
      outDate: '2026-08-21T08:00:00.000+0000', // 01:00 local on the 21st
    });
    expect(local.date).toBe('2026-08-20');
    expect(local.inMinutes).toBe(22 * 60);
    // 25:00, not 01:00 -- otherwise this reads as a negative-length shift.
    expect(local.outMinutes).toBe(25 * 60);
  });

  it('carries a missing employee reference through as null rather than throwing', () => {
    const local = shiftToLocal({ inDate: '2026-08-20T18:00:00.000+0000', outDate: '2026-08-20T21:00:00.000+0000' });
    expect(local.employeeGuid).toBeNull();
  });
});

describe('clampToLunch', () => {
  it('keeps only the part of a shift inside the rush', () => {
    expect(clampToLunch(7 * 60, 20 * 60)).toEqual([660, 840]);
  });

  it('rejects a shift that never touches lunch', () => {
    expect(clampToLunch(7 * 60, 10 * 60)).toBeNull();   // prep crew
    expect(clampToLunch(17 * 60, 21 * 60)).toBeNull();  // closers
  });

  it('treats a shift ending exactly at 11:00 as no overlap', () => {
    expect(clampToLunch(9 * 60, 11 * 60)).toBeNull();
  });
});

describe('durationForShift', () => {
  const cases: [string, number, number, string, boolean][] = [
    ['an all-day shift covers the whole rush', 10 * 60 + 45, 20 * 60, '11-2pm', true],
    ['a midday start maps to 12-2pm', 12 * 60, 20 * 60, '12-2pm', true],
    ['an early lunch maps to 11-1pm', 11 * 60, 13 * 60, '11-1pm', true],
    ['a last-slot shift maps to 1-2pm', 13 * 60, 14 * 60, '1-2pm', true],
    ['an exact 11-2 maps to 11-2pm', 11 * 60, 14 * 60, '11-2pm', true],
  ];

  for (const [label, start, end, duration, confident] of cases) {
    it(label, () => {
      const m = durationForShift(start, end)!;
      expect(m.duration).toBe(duration);
      expect(m.confident).toBe(confident);
    });
  }

  it('flags an 11-12 shift as a lossy fit instead of pretending', () => {
    // No bucket is 11am-12pm. '11-1pm' is the closest, and saying so quietly
    // would put someone on the floor for an hour they are not there.
    const m = durationForShift(11 * 60, 12 * 60)!;
    expect(m.duration).toBe('11-1pm');
    expect(m.confident).toBe(false);
    expect(m.clamped).toBe('11:00-12:00');
    expect(m.score).toBeLessThan(0.75);
  });

  it('flags a half-hour cameo as lossy', () => {
    const m = durationForShift(13 * 60 + 30, 14 * 60)!;
    expect(m.duration).toBe('1-2pm');
    expect(m.confident).toBe(false);
  });

  it('returns null for a shift with no lunch overlap at all', () => {
    expect(durationForShift(7 * 60, 10 * 60)).toBeNull();
  });

  it('prefers the widest bucket when a score ties', () => {
    const m = durationForShift(11 * 60, 14 * 60)!;
    expect(m.duration).toBe('11-2pm');
  });
});

describe('isGrillOpenerCandidate', () => {
  it('accepts a pre-service start and rejects an on-time one', () => {
    expect(isGrillOpenerCandidate(9 * 60)).toBe(true);
    expect(isGrillOpenerCandidate(10 * 60)).toBe(true);
    expect(isGrillOpenerCandidate(10 * 60 + 1)).toBe(false);
    expect(isGrillOpenerCandidate(11 * 60)).toBe(false);
  });
});

describe('lunchShiftsForDate', () => {
  it('keeps lunch shifts and drops prep, closers and deleted rows', () => {
    const result = lunchShiftsForDate(
      [
        shift(20, 7, 11),                              // prep only, no overlap
        shift(20, 10, 14),                             // the opener
        shift(20, 12, 20),                             // afternoon into close
        shift(20, 17, 21),                             // closers only
        shift(20, 11, 14, { deleted: true }),          // cancelled
      ],
      '2026-08-20',
    );
    expect(result.map((r) => r.raw)).toEqual(['10:00-14:00', '12:00-20:00']);
    expect(result[0].openerCandidate).toBe(true);
    expect(result[1].openerCandidate).toBe(false);
  });

  it('drops a shift that belongs to a different local date', () => {
    const result = lunchShiftsForDate([shift(21, 11, 14)], '2026-08-20');
    expect(result).toEqual([]);
  });

  it('survives a malformed row without losing the rest of the day', () => {
    const result = lunchShiftsForDate(
      [{ inDate: '', outDate: '' } as ToastShift, shift(20, 11, 14)],
      '2026-08-20',
    );
    expect(result).toHaveLength(1);
  });

  it('reports the real Toast times so a lossy mapping is visible', () => {
    const [row] = lunchShiftsForDate([shift(20, 11, 12)], '2026-08-20');
    expect(row.raw).toBe('11:00-12:00');
    expect(row.confident).toBe(false);
  });
});

describe('timeEntriesForDate', () => {
  it('keeps unscheduled clock-ins and marks who is still on the clock', () => {
    const entries = timeEntriesForDate(
      [
        { guid: 'a', employeeReference: { guid: 'e1' }, shiftReference: { guid: 's1' },
          inDate: '2026-08-20T18:00:00.000+0000', outDate: '2026-08-20T21:00:00.000+0000' },
        // No shiftReference: an unscheduled arrival, which is normal.
        { guid: 'b', employeeReference: { guid: 'e2' }, inDate: '2026-08-20T17:30:00.000+0000' },
        { guid: 'c', deleted: true, inDate: '2026-08-20T18:00:00.000+0000' },
      ],
      '2026-08-20',
    );
    expect(entries.map((e) => e.guid)).toEqual(['b', 'a']); // sorted by clock-in
    expect(entries[0].shiftGuid).toBeNull();
    expect(entries[0].stillClockedIn).toBe(true);
    expect(entries[1].stillClockedIn).toBe(false);
    expect(entries[1].outHHMM).toBe('14:00');
  });
});

describe('formatHHMM / formatRawRange', () => {
  it('drops :00 minutes and uses am/pm', () => {
    expect(formatRawRange('07:00-14:00')).toBe('7am - 2pm');
    expect(formatRawRange('11:00-21:00')).toBe('11am - 9pm');
  });

  it('keeps minutes when they are not on the hour', () => {
    expect(formatRawRange('10:45-20:30')).toBe('10:45am - 8:30pm');
  });

  it('handles both noon and midnight, which %12 gets wrong', () => {
    expect(formatHHMM('12:00')).toBe('12pm');
    expect(formatHHMM('00:00')).toBe('12am');
    expect(formatHHMM('00:15')).toBe('12:15am');
  });

  it('passes through anything it cannot parse rather than guessing', () => {
    expect(formatHHMM('nope')).toBe('nope');
    expect(formatHHMM('25:00')).toBe('25:00');
    expect(formatRawRange('07:00')).toBe('07:00');
    expect(formatRawRange('')).toBe('');
  });
});
