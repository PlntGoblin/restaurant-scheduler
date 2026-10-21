/**
 * GET /api/toast/employees
 *
 * The location's active Toast employees, for the Toast Link screen.
 *
 * NOT AUTHENTICATED. Deliberate, deferred decision (2026-10-20): the app's
 * login is localStorage-only and checks nothing server-side, so adding a
 * session here would be the only real gate in the app. Until that exists,
 * anyone who knows this URL can read staff names and Toast GUIDs. See the
 * "Toast integration" section of the README.
 */

import { NextResponse } from 'next/server';
import { describeError, fetchEmployees, isConfiguredOrThrow } from '@/lib/toast/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    isConfiguredOrThrow();
    const employees = await fetchEmployees();
    return NextResponse.json({ employees, count: employees.length });
  } catch (e) {
    const { status, body } = describeError(e);
    return NextResponse.json(body, { status });
  }
}
