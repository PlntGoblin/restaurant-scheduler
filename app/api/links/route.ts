/**
 * GET /api/links -- the Toast GUID -> person mapping.
 *
 * Guarded by `middleware.ts`: this returns employee legal names, so it
 * requires a session like every other data route.
 */
import { NextResponse } from 'next/server';
import {
  LinksConfigError,
  LinksQueryError,
  fetchEmployeeLinks,
  isLinksConfigured,
} from '@/lib/links/db';

export const dynamic = 'force-dynamic';

/**
 * 5 minutes. The mapping changes when someone is hired, not when someone
 * presses refresh -- but it must not be so stale that a new hire is invisible
 * for a whole shift.
 */
const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; body: unknown } | null = null;

export async function GET() {
  if (!isLinksConfigured()) {
    // Not an error: a deployment without the database credential still works,
    // it just falls back to whatever links were set by hand. Saying so plainly
    // beats a 500 that looks like an outage.
    return NextResponse.json({
      links: [],
      configured: false,
      message: 'SCHEDULER_LINKS_DB_URL is not set, so only manual links are available.',
    });
  }

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body);
  }

  try {
    const links = await fetchEmployeeLinks();
    const body = { links, configured: true, count: links.length };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof LinksConfigError) {
      return NextResponse.json(
        { error: 'config', message: e.message, links: [], configured: false },
        { status: 500 },
      );
    }
    if (e instanceof LinksQueryError) {
      // The message can carry connection details; keep it out of the response
      // and in the server log where it belongs.
      console.error('[links] query failed:', e.message);
      return NextResponse.json(
        {
          error: 'database',
          message: 'Could not reach the Forefathers database.',
          links: [],
          configured: true,
        },
        { status: 502 },
      );
    }
    throw e;
  }
}
