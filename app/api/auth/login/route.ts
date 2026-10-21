import { NextResponse } from 'next/server';
import {
  AuthNotConfiguredError,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  passwordMatches,
} from '@/lib/auth';
import {
  callerKey,
  checkRateLimit,
  clearFailures,
  createStore,
  recordFailure,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Failed attempts per caller, for as long as this instance stays warm.
 *
 * See lib/rate-limit.ts for what this is and is not worth -- it is a speed
 * bump across one instance, not a durable lock, because this app has no
 * writable datastore by design.
 */
const attempts = createStore();

export async function POST(request: Request) {
  const caller = callerKey(request.headers);
  const now = Date.now();

  // Checked BEFORE the password is compared, so a blocked caller learns
  // nothing about whether their guess was right.
  const verdict = checkRateLimit(attempts, caller, now);
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `Too many attempts. Try again in ${Math.ceil(verdict.retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } },
    );
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    if (!(await passwordMatches(password))) {
      recordFailure(attempts, caller, now);
      // Deliberately vague: "wrong password" and "no such user" must look
      // identical, and the response must not hint at length or format.
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    // A shift shares this password and will fat-finger it; getting it right
    // clears the slate rather than leaving them one slip from a lockout.
    clearFailures(attempts, caller);

    const token = await createSessionToken(now / 1000);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,            // JS cannot read it, so an XSS cannot steal it
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (e) {
    if (e instanceof AuthNotConfiguredError) {
      return NextResponse.json(
        { error: 'auth_not_configured', message: e.message },
        { status: 503 },
      );
    }
    throw e;
  }
}
