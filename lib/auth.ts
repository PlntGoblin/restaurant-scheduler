/**
 * Shared-password gate for this app's server routes.
 *
 * WHY THIS EXISTS
 * The login screen used to check a password that the browser itself had
 * stored (`localStorage['appAccount']`), which meant anyone could register
 * their own account and walk in, and meant the server knew nothing about who
 * was calling. That was tolerable while the app was pure client-side storage.
 * It stopped being tolerable the moment `/api/toast/*` started returning real
 * employee legal names and Toast GUIDs, and it is unacceptable now that
 * `/api/links` reads a Forefathers database.
 *
 * One shared password, which is what a back-office tool for a single store
 * actually wants -- not per-user accounts nobody will administer.
 *
 * Implemented on Web Crypto (`crypto.subtle`) rather than `node:crypto`
 * because the same code has to run in two places: the Edge middleware that
 * guards the routes, and the Node route handlers that issue the cookie.
 */

const enc = new TextEncoder();

export const SESSION_COOKIE = 'scheduler_session';

/** 30 days. Long on purpose: the store iPad should not log out mid-rush. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export class AuthNotConfiguredError extends Error {}

/**
 * Read the configured password and signing secret.
 *
 * Throws when either is missing. This FAILS CLOSED: an unconfigured deploy
 * serves 503 on the guarded routes rather than quietly serving employee data
 * to anyone. A gate that disables itself when misconfigured is not a gate.
 */
export function authConfig(): { password: string; secret: string } {
  const password = (process.env.SCHEDULER_PASSWORD ?? '').trim();
  const secret = (process.env.SCHEDULER_SESSION_SECRET ?? '').trim();
  if (!password || !secret) {
    throw new AuthNotConfiguredError(
      'SCHEDULER_PASSWORD and SCHEDULER_SESSION_SECRET must both be set.',
    );
  }
  return { password, secret };
}

export function isAuthConfigured(): boolean {
  try {
    authConfig();
    return true;
  } catch {
    return false;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compare two strings without leaking where they first differ.
 *
 * Only ever called on HMAC digests, which are fixed-length hex -- so the
 * length check below cannot itself leak anything about a secret.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Is this the right password?
 *
 * Both sides are HMAC'd before comparison, so neither the password's length
 * nor its leading characters are observable from how long this takes.
 */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const { password, secret } = authConfig();
  const [got, want] = await Promise.all([
    hmacHex(secret, candidate),
    hmacHex(secret, password),
  ]);
  return constantTimeEquals(got, want);
}

/** `<expiry>.<signature>` — the expiry is in the signed payload, not beside it. */
export async function createSessionToken(nowSeconds: number): Promise<string> {
  const { secret } = authConfig();
  const expiry = Math.floor(nowSeconds) + SESSION_TTL_SECONDS;
  return `${expiry}.${await hmacHex(secret, String(expiry))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  nowSeconds: number,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const expiryRaw = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(expiryRaw) || !/^[0-9a-f]{64}$/.test(signature)) return false;

  // Verify the signature BEFORE trusting the expiry: an unsigned token's
  // expiry is just a number an attacker typed.
  const { secret } = authConfig();
  const expected = await hmacHex(secret, expiryRaw);
  if (!constantTimeEquals(signature, expected)) return false;

  return Number(expiryRaw) > Math.floor(nowSeconds);
}
