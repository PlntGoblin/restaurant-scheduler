import { NextResponse } from 'next/server';
import {
  AuthNotConfiguredError,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  passwordMatches,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    if (!(await passwordMatches(password))) {
      // Deliberately vague: "wrong password" and "no such user" must look
      // identical, and the response must not hint at length or format.
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    const token = await createSessionToken(Date.now() / 1000);
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
