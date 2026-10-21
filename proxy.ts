/**
 * Guards every server route that returns real data about real people.
 *
 * Before this existed, `/api/toast/employees` on the public vercel.app URL
 * handed anyone who asked the legal name and Toast GUID of every employee at
 * the store. That was a known, documented, deliberately deferred gap
 * (2026-10-20). It is no longer deferred.
 *
 * Runs on the Edge runtime, so it uses `lib/auth`'s Web Crypto implementation
 * rather than `node:crypto`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isAuthConfigured, verifySessionToken } from './lib/auth';

export default async function proxy(req: NextRequest) {
  // Fail closed. An unconfigured deploy must not serve employee data.
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error: 'auth_not_configured',
        message:
          'SCHEDULER_PASSWORD and SCHEDULER_SESSION_SECRET are not set on this deployment.',
      },
      { status: 503 },
    );
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, Date.now() / 1000)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: 'unauthorized', message: 'Sign in to the scheduler first.' },
    { status: 401 },
  );
}

export const config = {
  /**
   * Every /api route EXCEPT /api/auth/*.
   *
   * A negative lookahead, not a list of the routes we currently have, so that
   * a route added next month is guarded WITHOUT anyone remembering to come
   * back here. Forgetting to update this file should mean "locked", never
   * "wide open" -- an allowlist gets that exactly backwards.
   *
   * /api/auth/* is excluded because the login route cannot require a session
   * in order to create one, and /api/auth/status has to be callable by a page
   * that does not yet know whether it is signed in.
   */
  matcher: ['/api/((?!auth/).*)'],
};
