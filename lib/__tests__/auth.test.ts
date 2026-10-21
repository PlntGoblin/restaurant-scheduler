import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuthNotConfiguredError,
  SESSION_TTL_SECONDS,
  authConfig,
  createSessionToken,
  isAuthConfigured,
  passwordMatches,
  verifySessionToken,
} from '../auth';

const PASSWORD = 'correct horse battery staple';
const SECRET = 'a'.repeat(64);

beforeEach(() => {
  process.env.SCHEDULER_PASSWORD = PASSWORD;
  process.env.SCHEDULER_SESSION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SCHEDULER_PASSWORD;
  delete process.env.SCHEDULER_SESSION_SECRET;
});

describe('authConfig', () => {
  it('fails closed when the password is missing', () => {
    delete process.env.SCHEDULER_PASSWORD;
    expect(() => authConfig()).toThrow(AuthNotConfiguredError);
    expect(isAuthConfigured()).toBe(false);
  });

  it('fails closed when the signing secret is missing', () => {
    delete process.env.SCHEDULER_SESSION_SECRET;
    expect(() => authConfig()).toThrow(AuthNotConfiguredError);
  });

  it('treats whitespace-only values as unset', () => {
    process.env.SCHEDULER_PASSWORD = '   ';
    expect(isAuthConfigured()).toBe(false);
  });
});

describe('passwordMatches', () => {
  it('accepts the configured password', async () => {
    await expect(passwordMatches(PASSWORD)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await expect(passwordMatches('hunter2')).resolves.toBe(false);
  });

  it('rejects a correct prefix', async () => {
    await expect(passwordMatches(PASSWORD.slice(0, -1))).resolves.toBe(false);
  });

  it('rejects the empty string', async () => {
    await expect(passwordMatches('')).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  const NOW = 1_780_000_000;

  it('round-trips a freshly issued token', async () => {
    const token = await createSessionToken(NOW);
    await expect(verifySessionToken(token, NOW)).resolves.toBe(true);
  });

  it('expires after the TTL', async () => {
    const token = await createSessionToken(NOW);
    await expect(verifySessionToken(token, NOW + SESSION_TTL_SECONDS - 1)).resolves.toBe(true);
    await expect(verifySessionToken(token, NOW + SESSION_TTL_SECONDS + 1)).resolves.toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await createSessionToken(NOW);
    process.env.SCHEDULER_SESSION_SECRET = 'b'.repeat(64);
    await expect(verifySessionToken(token, NOW)).resolves.toBe(false);
  });

  /**
   * The attack this is really about: take a real token, push the expiry out,
   * keep the signature. It must fail, and it must fail because the signature
   * is checked BEFORE the expiry is believed.
   */
  it('rejects an expiry edited to the future', async () => {
    const token = await createSessionToken(NOW);
    const signature = token.slice(token.indexOf('.') + 1);
    const forged = `${NOW + 10 * SESSION_TTL_SECONDS}.${signature}`;
    await expect(verifySessionToken(forged, NOW)).resolves.toBe(false);
  });

  it('rejects junk', async () => {
    const bad: (string | undefined)[] = [
      undefined,
      '',
      '.',
      'nodot',
      'abc.def',
      `${NOW}.`,
      `${NOW}.zz`,
      `-1.${'0'.repeat(64)}`,
      `${NOW}.${'0'.repeat(63)}`, // one hex char short
    ];
    for (const token of bad) {
      await expect(verifySessionToken(token, NOW)).resolves.toBe(false);
    }
  });
});
