/**
 * Toast API client -- SERVER SIDE ONLY.
 *
 * Nothing in this file may ever be imported into a client component. The
 * credentials are machine-client secrets; if they reach a browser bundle they
 * are a public read key for the restaurant's labor data.
 *
 * Ported from Forecast86's `toast_client.py`, which has run this auth flow
 * against production since 2026-08-18.
 *
 * Env (server-side, never NEXT_PUBLIC_):
 *   TOAST_CLIENT_ID        client identifier from Toast Web
 *   TOAST_CLIENT_SECRET    client secret (shown once at creation)
 *   TOAST_HOSTNAME         e.g. ws-api.toasttab.com
 *   TOAST_RESTAURANT_GUID  the location's GUID
 *
 * The GUID is not optional and not inferable: all three Forefathers locations
 * are named "Forefathers Cheesesteaks" in Toast with nothing on the list
 * endpoint to tell them apart, so the GUID is the only way to say which
 * restaurant you mean.
 *
 * Access tier note: Toast's Labor API is READ-ONLY here. There is no write
 * path, by design -- the generated rotation lives in this app, and this client
 * has no verb that could change anything in Toast.
 */

/** Tokens last 86400s; refresh a little early so one never expires in flight. */
const TOKEN_SAFETY_MARGIN_SECONDS = 300;

export class ToastConfigError extends Error {
  readonly kind = 'config' as const;
}

export class ToastAuthError extends Error {
  readonly kind = 'auth' as const;
}

export class ToastAPIError extends Error {
  readonly kind = 'api' as const;
  constructor(readonly status: number, readonly detail: string) {
    super(`Toast API ${status}: ${detail}`);
  }
}

function env(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) {
    throw new ToastConfigError(`${name} environment variable required`);
  }
  return v;
}

export function baseUrl(): string {
  const host = env('TOAST_HOSTNAME')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  return `https://${host}`;
}

export function restaurantGuid(): string {
  return env('TOAST_RESTAURANT_GUID');
}

/** True when all four values are present -- lets a route answer "not configured". */
export function isConfigured(): boolean {
  return (
    ['TOAST_CLIENT_ID', 'TOAST_CLIENT_SECRET', 'TOAST_HOSTNAME', 'TOAST_RESTAURANT_GUID']
      .every((k) => (process.env[k] ?? '').trim().length > 0)
  );
}

/**
 * Module-level token cache. On Vercel this lives only as long as the lambda
 * stays warm, which is fine: the worst case is one extra auth round trip on a
 * cold start, and the alternative -- re-authenticating per request -- adds
 * that round trip to every single call for no benefit.
 */
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getToken({ forceRefresh = false } = {}): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${baseUrl()}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: env('TOAST_CLIENT_ID'),
      clientSecret: env('TOAST_CLIENT_SECRET'),
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new ToastAuthError(
      `Toast authentication failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }

  const body = (await res.json()) as { token?: { accessToken?: string; expiresIn?: number } };
  const accessToken = body?.token?.accessToken;
  if (!accessToken) {
    throw new ToastAuthError('Toast authentication returned no accessToken');
  }

  cachedToken = accessToken;
  tokenExpiresAt =
    Date.now() + Math.max(0, (body.token?.expiresIn ?? 0) - TOKEN_SAFETY_MARGIN_SECONDS) * 1000;
  return accessToken;
}

/**
 * One authenticated GET against the Toast API.
 *
 * Retries exactly once on 401 with a forced token refresh: a cached token can
 * expire in the gap between the cache check and the request landing, and that
 * is a transient condition, not a credentials problem. Twice means the
 * credentials really are wrong, and it says so rather than looping.
 *
 * 429 is surfaced as its own status so a caller can say "Toast rate limited"
 * instead of a generic failure -- Toast asks for >=5s between historical
 * calls, so this is a condition we expect to meet occasionally.
 */
export async function toastGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const guid = restaurantGuid();
  const url = new URL(`${baseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (const attempt of [1, 2]) {
    const token = await getToken({ forceRefresh: attempt === 2 });
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Toast-Restaurant-External-ID': guid,
      },
      cache: 'no-store',
    });

    if (res.status === 401 && attempt === 1) continue;
    if (res.status === 429) {
      throw new ToastAPIError(
        429,
        `rate limited; Retry-After=${res.headers.get('Retry-After') ?? 'unset'}`,
      );
    }
    if (!res.ok) {
      throw new ToastAPIError(res.status, (await res.text()).slice(0, 500));
    }
    return (await res.json()) as T;
  }

  throw new ToastAuthError('Toast returned 401 twice; check credentials');
}
