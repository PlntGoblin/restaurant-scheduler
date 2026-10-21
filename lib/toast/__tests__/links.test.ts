import { describe, expect, it } from 'vitest';
import type { EmployeeLink, StaffMember } from '@/lib/types';
import { applyEmployeeLinks, seniorityFromLevel } from '../links';

function staff(name: string, opts: Partial<StaffMember> = {}): StaffMember {
  return {
    id: opts.id ?? `local-${name.toLowerCase().replace(/\s/g, '-')}`,
    name,
    positions: [],
    preferences: [],
    availability: [],
    seniority: 'Team Member',
    ...opts,
  };
}

function link(name: string, guids: string[], level: string | null = 'team_member'): EmployeeLink {
  return { name, toastGuids: guids, level, store: 'tempe' };
}

const G1 = '30cb32b5-d8bd-495b-aea5-44fd582a4eea';
const G2 = 'dce5c892-a037-4ec3-b4cb-f85bb57f069a';
const G3 = '83e096e3-9928-43fc-af3c-c054ffdbfb21';

describe('seniorityFromLevel', () => {
  it('maps the levels Forefathers actually uses', () => {
    expect(seniorityFromLevel('gm')).toBe('GM');
    expect(seniorityFromLevel('agm')).toBe('AGM');
    expect(seniorityFromLevel('captain')).toBe('Captain');
    expect(seniorityFromLevel('team_member')).toBe('Team Member');
  });

  it('defaults unknown or absent levels to Team Member', () => {
    expect(seniorityFromLevel(null)).toBe('Team Member');
    expect(seniorityFromLevel('')).toBe('Team Member');
    expect(seniorityFromLevel('shift_wizard')).toBe('Team Member');
  });
});

describe('applyEmployeeLinks', () => {
  it('creates a record for someone the app has never heard of', () => {
    const result = applyEmployeeLinks([], [link('Robert Wressell', [G1])], new Set([G1]));

    expect(result.created).toHaveLength(1);
    expect(result.created[0].name).toBe('Robert Wressell');
    expect(result.created[0].toastGuids).toEqual([G1]);
    expect(result.created[0].id).toBe(`toast-${G1}`);
    expect(result.changed).toBe(true);
    // Schedulable immediately -- a record with no positions can never be placed.
    expect(result.created[0].positions.length).toBeGreaterThan(0);
    expect(result.created[0].preferences.length).toBe(result.created[0].positions.length);
  });

  it('attaches GUIDs to an existing record whose name matches', () => {
    const existing = [staff('Robert Wressell')];
    const result = applyEmployeeLinks(existing, [link('Robert Wressell', [G1])], new Set([G1]));

    expect(result.created).toHaveLength(0);
    expect(result.attached).toEqual([
      { id: existing[0].id, name: 'Robert Wressell', guids: [G1] },
    ]);
    expect(result.staff[0].toastGuids).toEqual([G1]);
  });

  it('matches names case- and punctuation-insensitively', () => {
    const result = applyEmployeeLinks(
      [staff("robert  o'wressell")],
      [link("Robert O'Wressell", [G1])],
      new Set([G1]),
    );
    expect(result.attached).toHaveLength(1);
  });

  /**
   * The rule this whole integration exists to protect. "Red" and "Robert
   * Wressell" share no letters; pairing them is a guess, and a guess that
   * looks like a confirmation is worse than an empty field.
   */
  it('will NOT pair a nickname with a legal name', () => {
    const result = applyEmployeeLinks([staff('Red')], [link('Robert Wressell', [G1])], new Set([G1]));

    expect(result.attached).toHaveLength(0);
    expect(result.staff.find((m) => m.name === 'Red')?.toastGuids ?? []).toEqual([]);
    // It creates the real person instead of mangling the existing record.
    expect(result.created.map((m) => m.name)).toEqual(['Robert Wressell']);
  });

  it('takes ALL of a person’s GUIDs, not just today’s store', () => {
    // Devin Sergi really does have three -- one per location.
    const result = applyEmployeeLinks([], [link('Devin Sergi', [G3, G2])], new Set([G2]));
    expect(result.created[0].toastGuids).toEqual([G3, G2]);
  });

  it('ignores people who are not on the day being pulled', () => {
    const result = applyEmployeeLinks(
      [],
      [link('Robert Wressell', [G1]), link('Devin Sergi', [G2])],
      new Set([G1]),
    );
    expect(result.created.map((m) => m.name)).toEqual(['Robert Wressell']);
  });

  it('is a no-op on a second pull', () => {
    const links = [link('Robert Wressell', [G1])];
    const first = applyEmployeeLinks([], links, new Set([G1]));
    const second = applyEmployeeLinks(first.staff, links, new Set([G1]));

    expect(second.changed).toBe(false);
    expect(second.created).toHaveLength(0);
    expect(second.attached).toHaveLength(0);
    expect(second.staff).toHaveLength(1);
  });

  it('reports duplicate local names instead of picking one', () => {
    const result = applyEmployeeLinks(
      [staff('Mike Smith', { id: 'a' }), staff('mike smith', { id: 'b' })],
      [link('Mike Smith', [G1])],
      new Set([G1]),
    );

    expect(result.ambiguous).toEqual([{ name: 'Mike Smith', candidateIds: ['a', 'b'] }]);
    expect(result.created).toHaveLength(0);
    expect(result.attached).toHaveLength(0);
    expect(result.changed).toBe(false);
  });

  /**
   * A refresh must never be able to delete or rewrite someone. This is the
   * same class of bug as the roster that emptied itself in production on
   * 2026-10-20 -- additive is the only safe direction here.
   */
  it('never removes or renames an existing record', () => {
    const existing = [staff('Red'), staff('Maddie'), staff('Daniel Argaez')];
    const before = JSON.parse(JSON.stringify(existing));

    const result = applyEmployeeLinks(
      existing,
      [link('Robert Wressell', [G1]), link('Daniel Argaez', [G2])],
      new Set([G1, G2]),
    );

    expect(result.staff).toHaveLength(4); // the 3 originals, plus Robert
    for (const original of before) {
      const after = result.staff.find((m) => m.id === original.id);
      expect(after).toBeDefined();
      expect(after!.name).toBe(original.name);
    }
    // The input array itself is untouched -- callers may still be rendering it.
    expect(existing).toHaveLength(3);
    expect(existing[2].toastGuids).toBeUndefined();
  });

  it('skips links with no usable GUIDs', () => {
    const result = applyEmployeeLinks([], [link('Nobody', [])], new Set([G1]));
    expect(result.changed).toBe(false);
    expect(result.staff).toHaveLength(0);
  });
});
