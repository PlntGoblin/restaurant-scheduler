/**
 * GET /api/toast/shifts?date=YYYY-MM-DD
 *
 * The published Toast shifts that overlap the 11am-2pm lunch rush on one
 * restaurant-local date, each mapped to one of the Dashboard's four duration
 * buckets. `date` is a Phoenix-local calendar date, not the viewer's.
 *
 * `totalShifts` vs `shifts.length` is the honest pair: the first is what Toast
 * had for the day, the second is what touches lunch. A 7am prep crew and a
 * 9pm closer are real shifts this scheduler has no opinion about, and the UI
 * should be able to say so rather than implying Toast returned nothing.
 *
 * NOT AUTHENTICATED -- see app/api/toast/employees/route.ts.
 */

import { NextResponse } from 'next/server';
import { lunchShiftsForDate } from '@/lib/toast/shifts';
import {
  describeError,
  fetchShifts,
  isConfiguredOrThrow,
  requireDateParam,
} from '@/lib/toast/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    isConfiguredOrThrow();
    const date = requireDateParam(request.url);
    const raw = await fetchShifts(date);
    const shifts = lunchShiftsForDate(raw, date);
    return NextResponse.json({
      date,
      shifts,
      count: shifts.length,
      totalShifts: raw.filter((s) => !s?.deleted).length,
    });
  } catch (e) {
    const { status, body } = describeError(e);
    return NextResponse.json(body, { status });
  }
}
