import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isAuthConfigured, verifySessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Does the caller already hold a valid session?
 *
 * The session cookie lasts 30 days but is httpOnly, so the page cannot read
 * it. Without this route a returning user would see the login screen despite
 * being signed in -- the cookie would work, but only invisibly.
 */
export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ authenticated: false, configured: false });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return NextResponse.json({
    authenticated: await verifySessionToken(token, Date.now() / 1000),
    configured: true,
  });
}
