/**
 * Restaurant-local time handling for Toast data.
 *
 * Toast returns every timestamp in UTC. Every Forefathers location is in
 * Arizona, which does not observe DST, so a hardcoded -7 offset would work
 * today -- and would silently break for any store that isn't in Arizona.
 * Everything here goes through Intl with an explicit timeZone instead.
 *
 * Getting this wrong does not throw. Treating Toast's UTC stamps as local
 * slides every shift by 7 hours, and a 7-hour-wrong schedule still looks
 * entirely plausible on screen. That is why this module exists at all.
 */

export const RESTAURANT_TZ = 'America/Phoenix';

/** Wall-clock fields as read in a given timezone. */
export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;
  second: number;
}

const partsFormatter = (tz: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = partsFormatter(tz);
    formatterCache.set(tz, f);
  }
  return f;
}

/** A UTC instant, read as wall-clock fields in `tz`. */
export function partsIn(date: Date, tz: string = RESTAURANT_TZ): LocalParts {
  const out: Record<string, number> = {};
  for (const p of getFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second ?? 0,
  };
}

/**
 * Parse a Toast timestamp into restaurant-local wall-clock fields.
 *
 * Toast sends `2026-08-20T01:00:00.000+0000`. `Date` parses that correctly,
 * so the only real work is reading it back out in the restaurant's zone.
 */
export function toLocalParts(isoUtc: string, tz: string = RESTAURANT_TZ): LocalParts {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Unparseable Toast timestamp: ${isoUtc}`);
  }
  return partsIn(d, tz);
}

/** Minutes since local midnight. The unit every lunch-window comparison uses. */
export function minutesOfDay(p: LocalParts): number {
  return p.hour * 60 + p.minute;
}

/** `YYYY-MM-DD` for a set of local parts. */
export function dateKey(p: LocalParts): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** `HH:MM`, 24-hour. */
export function hhmm(p: LocalParts): string {
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Minutes since midnight as `HH:MM`, for rendering mapped windows. */
export function minutesToHHMM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Offset of `tz` from UTC, in minutes, at a given instant.
 * Phoenix returns -420 year round.
 */
function offsetMinutes(at: Date, tz: string): number {
  const p = partsIn(at, tz);
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asIfUTC - at.getTime()) / 60000;
}

/**
 * A local wall-clock time -> the UTC instant it refers to.
 *
 * Two passes: the first offset is looked up using the wall-clock reading as
 * if it were UTC, which is off by the offset itself near a DST boundary; the
 * second pass re-reads it at the corrected instant. Arizona never needs the
 * second pass, but a store that observes DST does, and a once-a-year
 * off-by-an-hour is exactly the kind of bug nobody can reproduce.
 */
export function localWallClockToUTC(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  tz: string = RESTAURANT_TZ,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = naive - offsetMinutes(new Date(naive), tz) * 60000;
  ts = naive - offsetMinutes(new Date(ts), tz) * 60000;
  return new Date(ts);
}

/** Toast's Labor API date format: `2026-08-19T07:00:00.000+0000`. */
export function toastTimestamp(d: Date): string {
  const iso = d.toISOString(); // 2026-08-19T07:00:00.000Z
  return `${iso.slice(0, 23)}+0000`;
}

/** The Labor API caps any date-range query at one month. */
export const LABOR_WINDOW_MAX_DAYS = 30;

/**
 * Parse and VALIDATE a `YYYY-MM-DD` calendar date.
 *
 * The shape check alone is not enough: `Date.UTC(2026, 12, 99)` happily rolls
 * over into a real instant, so "2026-13-99" would quietly become some other
 * day and the caller would get a confident, wrong answer for it. Round-trip
 * the components and reject anything that does not survive.
 */
export function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Expected a YYYY-MM-DD date, got: ${date}`);
  const [year, month, day] = [+m[1], +m[2], +m[3]];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Not a real calendar date: ${date}`);
  }
  return { year, month, day };
}

/**
 * `startDate`/`endDate` params for a Labor API query covering `days` of
 * restaurant-local calendar days starting at local midnight on `date`.
 */
export function laborWindow(
  date: string,
  days = 1,
  tz: string = RESTAURANT_TZ,
): { startDate: string; endDate: string } {
  if (days > LABOR_WINDOW_MAX_DAYS) {
    throw new Error(`Labor API windows are capped at one month (got ${days} days)`);
  }
  const { year, month, day } = parseLocalDate(date);
  const start = localWallClockToUTC(year, month, day, 0, 0, tz);
  const end = new Date(start.getTime() + days * 86400000);
  return { startDate: toastTimestamp(start), endDate: toastTimestamp(end) };
}

/** Today's `YYYY-MM-DD` in the restaurant's timezone, not the viewer's. */
export function todayLocal(tz: string = RESTAURANT_TZ): string {
  return dateKey(partsIn(new Date(), tz));
}
