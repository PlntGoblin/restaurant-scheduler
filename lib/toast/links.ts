/**
 * Turns the My Forefathers GUID->person mapping into staff records this app
 * can schedule. Pure: no I/O, no localStorage.
 *
 * WHY THIS IS NOT JUST A LOOKUP
 * Knowing that GUID `30cb32b5...` is "Robert Wressell" is not enough to put
 * him in a rotation -- the generator schedules `StaffMember`s, so a person
 * with no record here cannot be placed at a position no matter how well we
 * know their name. So resolving a GUID has to be able to MATERIALISE a
 * record, not just label a row.
 *
 * WHAT IT WILL NOT DO
 * It will not pair "Red" with "Robert Wressell". The database is authoritative
 * about GUID->name; it knows nothing about the nicknames typed into this app.
 * A nickname and a legal name that share no letters are a question for a
 * human, and this file reports them rather than resolving them -- the same
 * rule `suggestLinks` already follows.
 */
import type { EmployeeLink, Position, Seniority, StaffMember } from '@/lib/types';
import { ALL_POSITIONS } from '@/lib/constants';
import { norm } from './match';

/** Forefathers `level` -> this app's `Seniority`. Unknown levels are staff. */
export function seniorityFromLevel(level: string | null): Seniority {
  switch ((level ?? '').trim().toLowerCase()) {
    case 'gm':
      return 'GM';
    case 'agm':
      return 'AGM';
    case 'captain':
      return 'Captain';
    default:
      return 'Team Member';
  }
}

/** A staff record whose `toastGuids` is known to be present, not optional. */
type LinkedStaff = StaffMember & { toastGuids: string[] };

function newStaffFromLink(link: EmployeeLink): LinkedStaff {
  return {
    id: `toast-${link.toastGuids[0]}`,
    name: link.name,
    positions: [...ALL_POSITIONS] as Position[],
    preferences: (ALL_POSITIONS as readonly Position[]).map((position) => ({
      position,
      preferenceLevel: 3 as const,
    })),
    availability: ([0, 1, 2, 3, 4, 5, 6] as const).map((dayOfWeek) => ({
      dayOfWeek,
      available: true,
    })),
    seniority: seniorityFromLevel(link.level),
    toastGuids: [...link.toastGuids],
  };
}

export interface LinkApplication {
  /** The staff list to persist. Same array contents when `changed` is false. */
  staff: StaffMember[];
  /** Existing records that gained GUIDs because their name matched. */
  attached: { id: string; name: string; guids: string[] }[];
  /** Records created for people this app had never heard of. */
  created: StaffMember[];
  /**
   * Links we refused to apply because more than one existing staff record
   * normalises to the same name. Reported, never guessed between.
   */
  ambiguous: { name: string; candidateIds: string[] }[];
  changed: boolean;
}

/**
 * Resolve the GUIDs on one day's Toast schedule against the staff list.
 *
 * Scoped to `relevantGuids` -- the GUIDs actually on that day's schedule --
 * rather than materialising all 42 linked employees. The roster should contain
 * people who work here, not every person the database can name; importing the
 * whole company the first time someone presses refresh would be a mess to
 * undo by hand.
 *
 * NEVER removes or rewrites an existing record. The only mutations are
 * appending GUIDs to a name-matched record and appending brand-new records --
 * both additive, because a refresh that can delete a staff member is a
 * refresh that will eventually delete the wrong one.
 */
export function applyEmployeeLinks(
  staff: StaffMember[],
  links: EmployeeLink[],
  relevantGuids: Set<string>,
): LinkApplication {
  const attached: LinkApplication['attached'] = [];
  const created: StaffMember[] = [];
  const ambiguous: LinkApplication['ambiguous'] = [];

  // Every GUID already claimed by a staff record, so a second pull is a no-op.
  const claimed = new Set<string>();
  for (const member of staff) {
    for (const guid of member.toastGuids ?? []) claimed.add(guid);
  }

  // Existing records bucketed by normalised name. A bucket with two entries is
  // ambiguous -- "Mike Smith" and "mike smith" are one key and two records,
  // and attaching a GUID to the wrong one is invisible until it schedules the
  // wrong person.
  const byName = new Map<string, StaffMember[]>();
  for (const member of staff) {
    const key = norm(member.name);
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(member);
    else byName.set(key, [member]);
  }

  const next: LinkedStaff[] = staff.map((m) => ({
    ...m,
    toastGuids: [...(m.toastGuids ?? [])],
  }));
  const nextById = new Map(next.map((m) => [m.id, m]));

  for (const link of links) {
    const relevant = link.toastGuids.filter((g) => relevantGuids.has(g));
    if (relevant.length === 0) continue;
    if (relevant.every((g) => claimed.has(g))) continue;

    const bucket = byName.get(norm(link.name)) ?? [];
    if (bucket.length > 1) {
      ambiguous.push({ name: link.name, candidateIds: bucket.map((m) => m.id) });
      continue;
    }

    if (bucket.length === 1) {
      const target = nextById.get(bucket[0].id);
      if (!target) continue;
      const gained = link.toastGuids.filter((g) => !target.toastGuids.includes(g));
      if (gained.length === 0) continue;
      // All of the person's GUIDs, not just the one on today's schedule: they
      // are the same human tomorrow when they cover at another store.
      target.toastGuids.push(...gained);
      gained.forEach((g) => claimed.add(g));
      attached.push({ id: target.id, name: target.name, guids: gained });
      continue;
    }

    const record = newStaffFromLink(link);
    next.push(record);
    nextById.set(record.id, record);
    link.toastGuids.forEach((g) => claimed.add(g));
    created.push(record);
  }

  return {
    staff: next,
    attached,
    created,
    ambiguous,
    changed: attached.length > 0 || created.length > 0,
  };
}
