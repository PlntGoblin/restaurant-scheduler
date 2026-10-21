/**
 * GET /api/toast/time-entries?date=YYYY-MM-DD
 *
 * Actual clock-in/out for one restaurant-local date, used by the Dashboard's
 * clock-in reconcile to spot no-shows and unscheduled arrivals.
 *
 * Entries with no `shiftReference` are kept: roughly half have none, and they
 * are unscheduled clock-ins -- a normal thing in a restaurant, and precisely
 * the case the reconcile exists to catch.
 *
 * NOT AUTHENTICATED -- see app/api/toast/employees/route.ts.
 */

import { NextResponse } from 'next/server';
import { timeEntriesForDate } from '@/lib/toast/shifts';
import {
  describeError,
  fetchTimeEntries,
  isConfiguredOrThrow,
  requireDateParam,
} from '@/lib/toast/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    isConfiguredOrThrow();
    const date = requireDateParam(request.url);
    const entries = timeEntriesForDate(await fetchTimeEntries(date), date);
    return NextResponse.json({ date, entries, count: entries.length });
  } catch (e) {
    const { status, body } = describeError(e);
    return NextResponse.json(body, { status });
  }
}
