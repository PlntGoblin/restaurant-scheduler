/**
 * Suggesting which Toast employee is which staff member.
 *
 * Ported from Forecast86's `toast_sync.py:_match_employee` and
 * `scripts/link_toast_employees.py`, including the reasons.
 *
 * THE RULE THIS MODULE EXISTS TO PROTECT: nothing here links anybody. It
 * SUGGESTS, and a human confirms. Toast returns legal names ("Antoinette",
 * "John") where this app and Sling show chosen ones ("Toni", "Jack"), so a
 * name join silently drops exactly the people whose names differ -- and a
 * roster that quietly under-counts is worse than no roster, because a manager
 * acts on it. The join key in storage is always the GUID.
 */

/** A Toast employee record (fields we read). */
export interface ToastEmployee {
  guid: string;
  firstName?: string | null;
  lastName?: string | null;
  chosenName?: string | null;
  deleted?: boolean;
  externalEmployeeId?: string | null;
}

export interface ToastEmployeeDTO {
  guid: string;
  firstName: string;
  lastName: string;
  chosenName: string | null;
  /** Chosen name when Toast has one, else the legal first name. */
  displayName: string;
  /** Always the legal name, so an ambiguous pair stays distinguishable. */
  legalName: string;
}

/** Letters only, lowercased. "O'Brien-Smith" and "obriensmith" are one key. */
export function norm(...parts: (string | null | undefined)[]): string {
  return parts.join('').toLowerCase().replace(/[^a-z]/g, '');
}

export function toEmployeeDTO(e: ToastEmployee): ToastEmployeeDTO {
  const first = (e.firstName ?? '').trim();
  const last = (e.lastName ?? '').trim();
  const chosen = (e.chosenName ?? '').trim() || null;
  return {
    guid: e.guid,
    firstName: first,
    lastName: last,
    chosenName: chosen,
    displayName: `${chosen || first} ${last}`.trim(),
    legalName: `${first} ${last}`.trim(),
  };
}

/**
 * Every name key a Toast employee could be found under: their legal name,
 * and their chosen name with the same surname.
 */
export function nameKeys(e: ToastEmployeeDTO): Set<string> {
  const keys = new Set<string>([norm(e.firstName, e.lastName)]);
  if (e.chosenName) keys.add(norm(e.chosenName, e.lastName));
  return keys;
}

/** Identity of a human, independent of which store's record you are holding. */
function personKey(e: ToastEmployeeDTO): string {
  return norm(e.firstName, e.lastName);
}

export interface Suggestion {
  /** Every Toast GUID belonging to the suggested person. */
  guids: string[];
  displayName: string;
  legalName: string;
}

export interface AmbiguousMatch {
  /** The distinct humans that name could mean. */
  candidates: ToastEmployeeDTO[];
}

export interface MatchResult {
  /** staffId -> the single person we are confident that name refers to. */
  suggestions: Map<string, Suggestion>;
  /** staffId -> the several people it could be. Reported, never guessed. */
  ambiguous: Map<string, AmbiguousMatch>;
  /** Toast GUIDs no staff name reached. Candidates for "Add to roster". */
  unmatchedToastGuids: string[];
}

/**
 * Suggest a Toast person for each staff member, by name.
 *
 * Buckets are keyed by name and hold employees DEDUPED BY GUID FIRST. That
 * dedupe is not tidiness: someone whose chosenName equals their first name
 * ("Jake" / Jake Vitton) generates two identical keys, lands in the bucket
 * twice, looks ambiguous, and gets skipped. That bug silently dropped two
 * people on Forecast86's first run.
 *
 * A name resolves only when the surviving candidates are ONE human. If it is
 * two, it goes to `ambiguous` for a person to settle -- a wrong link tells a
 * manager somebody is scheduled who is not.
 *
 * All of that person's GUIDs come back, not just one: a human has a different
 * Toast GUID at every store they can work, and a single value loses their
 * shifts the moment they cover elsewhere.
 */
export function suggestLinks(
  toastEmployees: ToastEmployeeDTO[],
  staff: { id: string; name: string }[],
): MatchResult {
  const buckets = new Map<string, Map<string, ToastEmployeeDTO>>();

  for (const e of toastEmployees) {
    for (const key of nameKeys(e)) {
      if (!key) continue;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = new Map();
        buckets.set(key, bucket);
      }
      bucket.set(e.guid, e); // keyed by GUID -- see the note above
    }
  }

  const suggestions = new Map<string, Suggestion>();
  const ambiguous = new Map<string, AmbiguousMatch>();
  const reached = new Set<string>();

  for (const s of staff) {
    const hits = [...(buckets.get(norm(s.name))?.values() ?? [])];
    if (hits.length === 0) continue;

    const people = new Set(hits.map(personKey));
    if (people.size === 1) {
      const guids = hits.map((h) => h.guid).sort();
      suggestions.set(s.id, {
        guids,
        displayName: hits[0].displayName,
        legalName: hits[0].legalName,
      });
      for (const g of guids) reached.add(g);
    } else {
      // Dedupe the report by person so the UI shows two humans, not six records.
      const byPerson = new Map<string, ToastEmployeeDTO>();
      for (const h of hits) if (!byPerson.has(personKey(h))) byPerson.set(personKey(h), h);
      ambiguous.set(s.id, { candidates: [...byPerson.values()] });
    }
  }

  return {
    suggestions,
    ambiguous,
    unmatchedToastGuids: toastEmployees
      .map((e) => e.guid)
      .filter((g) => !reached.has(g)),
  };
}
