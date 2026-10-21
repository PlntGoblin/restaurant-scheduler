/**
 * Reads the Toast-GUID -> person mapping out of the My Forefathers database.
 *
 * SERVER ONLY. Holds a database credential; must never be imported from a
 * client component.
 *
 * WHY THIS EXISTS
 * Toast's schedule identifies people by GUID and nothing else. Turning a GUID
 * back into a human needs a mapping, and that mapping is already maintained
 * -- Forecast86's `scripts/link_toast_employees.py` keeps
 * `employees.external_ids->'toast_guids'` current as people are hired, and
 * handles the awkward parts (one human has a different GUID at every store;
 * Devin Sergi has three). Duplicating that work here, by hand, in one
 * browser's localStorage, produced a mapping that was stale the next day and
 * absent on every other device.
 *
 * WHAT THIS CAN SEE
 * Exactly one view, `public.toast_employee_links` (supabase/phase36 in the
 * Forecast86 repo), through a login role granted SELECT on nothing else. It
 * cannot read HR notes, manager notes, sign-offs or forecasts, and it cannot
 * write anything anywhere. If this credential leaks, what leaks is employee
 * names and Toast GUIDs -- which this app displays to its users anyway.
 */
import { Pool } from 'pg';
import type { EmployeeLink } from '@/lib/types';

export class LinksConfigError extends Error {}
export class LinksQueryError extends Error {}

/**
 * One pool per warm lambda.
 *
 * The connection string must point at Supabase's TRANSACTION-mode pooler
 * (port 6543). Serverless invocations are short and numerous; pointing this
 * at the database directly exhausts its connection limit under any real load.
 */
let pool: Pool | null = null;

function connectionString(): string {
  const url = (process.env.SCHEDULER_LINKS_DB_URL ?? '').trim();
  if (!url) {
    throw new LinksConfigError('SCHEDULER_LINKS_DB_URL is not set.');
  }
  return url;
}

export function isLinksConfigured(): boolean {
  return Boolean((process.env.SCHEDULER_LINKS_DB_URL ?? '').trim());
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Supabase's pooler terminates TLS with a certificate this client has no
      // CA bundle for. The connection is still encrypted; we are not
      // validating the far end's identity. Acceptable here and nowhere near a
      // write path: the credential can read one view of names and GUIDs.
      ssl: { rejectUnauthorized: false },
    });
    // A pool that emits 'error' with no listener crashes the process.
    pool.on('error', () => {});
  }
  return pool;
}

/**
 * No parameters, by design.
 *
 * Supabase's transaction-mode pooler does not support named prepared
 * statements, and a fixed query with no user input cannot be injected.
 */
const QUERY = `
  select name, toast_guids, level, store
  from public.toast_employee_links
  order by name
`;

export async function fetchEmployeeLinks(): Promise<EmployeeLink[]> {
  let rows: Array<Record<string, unknown>>;
  try {
    const result = await getPool().query(QUERY);
    rows = result.rows;
  } catch (e) {
    throw new LinksQueryError(e instanceof Error ? e.message : String(e));
  }

  return rows.flatMap((row) => {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    // jsonb comes back already parsed by pg.
    const raw = Array.isArray(row.toast_guids) ? row.toast_guids : [];
    const toastGuids = raw.filter((g): g is string => typeof g === 'string' && g.length > 0);
    if (!name || toastGuids.length === 0) return [];
    return [{
      name,
      toastGuids,
      level: typeof row.level === 'string' ? row.level : null,
      store: typeof row.store === 'string' ? row.store : null,
    }];
  });
}
