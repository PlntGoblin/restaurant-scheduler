import { describe, expect, it } from 'vitest';
import {
  LABOR_WINDOW_MAX_DAYS,
  dateKey,
  hhmm,
  laborWindow,
  localWallClockToUTC,
  minutesOfDay,
  minutesToHHMM,
  toLocalParts,
  parseLocalDate,
  toastTimestamp,
} from '../time';

describe('toLocalParts', () => {
  it('reads a Toast UTC stamp as Phoenix wall-clock time', () => {
    // 21:00 UTC is 14:00 in Phoenix. Reading this as local would put the
    // shift seven hours late and still look plausible.
    const p = toLocalParts('2026-08-20T21:00:00.000+0000');
    expect(hhmm(p)).toBe('14:00');
    expect(dateKey(p)).toBe('2026-08-20');
  });

  it('rolls back a day for an early-morning UTC stamp', () => {
    const p = toLocalParts('2026-08-20T04:00:00.000+0000');
    expect(dateKey(p)).toBe('2026-08-19');
    expect(hhmm(p)).toBe('21:00');
  });

  it('refuses a stamp it cannot parse rather than inventing a time', () => {
    expect(() => toLocalParts('not a date')).toThrow(/Unparseable/);
  });
});

describe('laborWindow', () => {
  it('starts at Phoenix midnight expressed in UTC', () => {
    // The exact assertion Forecast86's test_toast_labor.py makes.
    expect(laborWindow('2026-08-19', 7)).toEqual({
      startDate: '2026-08-19T07:00:00.000+0000',
      endDate: '2026-08-26T07:00:00.000+0000',
    });
  });

  it('defaults to a single local day', () => {
    expect(laborWindow('2026-08-19')).toEqual({
      startDate: '2026-08-19T07:00:00.000+0000',
      endDate: '2026-08-20T07:00:00.000+0000',
    });
  });

  it('refuses a window past the API cap of one month', () => {
    expect(() => laborWindow('2026-08-19', LABOR_WINDOW_MAX_DAYS + 1)).toThrow(/one month/);
  });

  it('refuses a malformed date', () => {
    expect(() => laborWindow('08/19/2026')).toThrow(/YYYY-MM-DD/);
  });

  it('refuses a well-shaped date that is not a real day', () => {
    // Date.UTC(2026, 12, 99) rolls over into a real instant, so without a
    // calendar check this would return a confident window for some other day.
    expect(() => laborWindow('2026-13-99')).toThrow(/Not a real calendar date/);
  });
});

describe('parseLocalDate', () => {
  it('accepts a real date', () => {
    expect(parseLocalDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(() => parseLocalDate('2026-02-29')).toThrow(/Not a real calendar date/);
  });

  it('rejects month 00, month 13 and day 32', () => {
    expect(() => parseLocalDate('2026-00-10')).toThrow(/Not a real calendar date/);
    expect(() => parseLocalDate('2026-13-10')).toThrow(/Not a real calendar date/);
    expect(() => parseLocalDate('2026-01-32')).toThrow(/Not a real calendar date/);
  });

  it('rejects anything that is not the YYYY-MM-DD shape', () => {
    expect(() => parseLocalDate('2026-1-1')).toThrow(/YYYY-MM-DD/);
    expect(() => parseLocalDate('')).toThrow(/YYYY-MM-DD/);
  });
});

describe('localWallClockToUTC', () => {
  it('holds across a US DST boundary for a zone that observes it', () => {
    // Phoenix never shifts, so a hardcoded -7 would pass every Arizona test
    // and quietly break elsewhere. New York proves the two-pass lookup works:
    // EST is -05:00, EDT is -04:00.
    const winter = localWallClockToUTC(2026, 1, 15, 0, 0, 'America/New_York');
    const summer = localWallClockToUTC(2026, 7, 15, 0, 0, 'America/New_York');
    expect(toastTimestamp(winter)).toBe('2026-01-15T05:00:00.000+0000');
    expect(toastTimestamp(summer)).toBe('2026-07-15T04:00:00.000+0000');
  });

  it('is unaffected by DST in Phoenix', () => {
    expect(toastTimestamp(localWallClockToUTC(2026, 1, 15))).toBe('2026-01-15T07:00:00.000+0000');
    expect(toastTimestamp(localWallClockToUTC(2026, 7, 15))).toBe('2026-07-15T07:00:00.000+0000');
  });
});

describe('minute helpers', () => {
  it('round-trips minutes and HH:MM', () => {
    expect(minutesOfDay({ year: 2026, month: 8, day: 20, hour: 11, minute: 30, second: 0 })).toBe(690);
    expect(minutesToHHMM(690)).toBe('11:30');
    expect(minutesToHHMM(840)).toBe('14:00');
  });
});
