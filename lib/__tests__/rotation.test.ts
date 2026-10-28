import { describe, expect, it } from 'vitest';
import {
  generateRotation,
  isHot,
  positionsFor,
  preferenceFor,
  slotsForDuration,
  stationOf,
  UNFILLED,
  type HistoryDay,
  type RotationStaff,
  type Schedule,
} from '../rotation';
import { TIME_SLOTS } from '@/lib/constants';
import type { Position, TimeSlot } from '@/lib/types';

// Small deterministic PRNG so every run sees the same "random" rosters.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const NAMES = ['Devin', 'Tonny', 'Red', 'Maddie', 'Ana', 'Jay', 'Kai', 'Lee'];

function person(
  name: string,
  opts: { grill?: number; fries?: number; pos?: number; slots?: TimeSlot[] } = {},
): RotationStaff {
  return {
    id: name.toLowerCase(),
    name,
    availableSlots: opts.slots ?? [...TIME_SLOTS],
    preferences: [
      { position: 'Grill 1', preferenceLevel: (opts.grill ?? 3) as 1 | 2 | 3 | 4 | 5 },
      { position: 'Fries', preferenceLevel: (opts.fries ?? 3) as 1 | 2 | 3 | 4 | 5 },
      { position: 'P.O.S.', preferenceLevel: (opts.pos ?? 3) as 1 | 2 | 3 | 4 | 5 },
    ],
  };
}

function crew(n: number): RotationStaff[] {
  return NAMES.slice(0, n).map(name => person(name));
}

function run(staff: RotationStaff[], extra: Partial<Parameters<typeof generateRotation>[0]> = {}) {
  return generateRotation({
    staff,
    grillOpener: '',
    oneGrillerOnly: false,
    history: [],
    random: seeded(42),
    ...extra,
  });
}

/** staffId -> ordered list of positions across the day (slot order). */
function perPerson(schedule: Schedule): Map<string, Array<{ slot: TimeSlot; position: Position }>> {
  const m = new Map<string, Array<{ slot: TimeSlot; position: Position }>>();
  for (const slot of TIME_SLOTS) {
    for (const a of schedule[slot]) {
      if (!a.staffId) continue;
      if (!m.has(a.staffId)) m.set(a.staffId, []);
      m.get(a.staffId)!.push({ slot, position: a.position });
    }
  }
  return m;
}

function unfilled(schedule: Schedule): number {
  return TIME_SLOTS.flatMap(s => schedule[s]).filter(a => a.staffName === UNFILLED).length;
}

/** The invariants every schedule must satisfy. Throws with a readable reason. */
function assertRules(schedule: Schedule, staff: RotationStaff[], opener: string, relaxed: boolean) {
  const byId = new Map(staff.map(s => [s.id, s]));
  for (const slot of TIME_SLOTS) {
    const ids = schedule[slot].map(a => a.staffId).filter(Boolean);
    expect(new Set(ids).size, `${slot}: someone stands in two places`).toBe(ids.length);
    for (const a of schedule[slot]) {
      if (!a.staffId) continue;
      expect(byId.get(a.staffId)!.availableSlots, `${a.staffName} not on shift at ${slot}`).toContain(slot);
    }
  }
  for (const [id, day] of perPerson(schedule)) {
    const stations = day.map(d => stationOf(d.position));
    expect(new Set(stations).size, `${id} works a station twice: ${stations.join(', ')}`).toBe(stations.length);

    if (!relaxed) {
      for (let i = 1; i < day.length; i++) {
        const prevIdx = TIME_SLOTS.indexOf(day[i - 1].slot);
        const curIdx = TIME_SLOTS.indexOf(day[i].slot);
        if (curIdx === prevIdx + 1 && isHot(day[i - 1].position) && isHot(day[i].position)) {
          throw new Error(`${id} is hot back to back: ${day[i - 1].position} -> ${day[i].position}`);
        }
      }
    }
    if (id === opener) {
      const first = day.find(d => d.slot === '11am-12pm');
      if (first) expect(isHot(first.position), `opener ${id} is hot at 11am`).toBe(false);
    }
  }
}

describe('stations', () => {
  it('treats Grill 1/2 and Lobby/Dish 1/2 as one station each', () => {
    expect(stationOf('Grill 1')).toBe('Grill');
    expect(stationOf('Grill 2')).toBe('Grill');
    expect(stationOf('Lobby/Dish 2')).toBe('Lobby/Dish');
    expect(stationOf('Expo 2')).toBe('Expo 2');
  });

  it('Grill 2 reads the Grill 1 preference', () => {
    const prefs = person('x', { grill: 5 }).preferences;
    expect(preferenceFor(prefs, 'Grill 2')).toBe(5);
    expect(preferenceFor(prefs, 'Expo 1')).toBe(3);
  });

  it('maps shift durations to slots', () => {
    expect(slotsForDuration('11-1pm')).toEqual(['11am-12pm', '12pm-1pm']);
    expect(slotsForDuration('1-2pm')).toEqual(['1pm-2pm']);
  });
});

describe('staffing matrix', () => {
  it('7 staff: second griller stands down at 1pm, hands go to dish', () => {
    expect(positionsFor(7, '12pm-1pm', false)).toContain('Grill 2');
    expect(positionsFor(7, '1pm-2pm', false)).not.toContain('Grill 2');
    expect(positionsFor(7, '1pm-2pm', false)).toContain('Lobby/Dish 2');
  });

  it('every headcount fills exactly headcount positions per slot', () => {
    for (const n of [5, 6, 7, 8]) {
      for (const slot of TIME_SLOTS) {
        expect(positionsFor(n, slot, false).length, `${n} staff, ${slot}`).toBe(n);
        expect(positionsFor(n, slot, true).length, `${n} staff, ${slot}, slow day`).toBe(Math.min(n, 7));
      }
    }
  });

  it('Slow Day never has a second griller', () => {
    for (const n of [5, 6, 7, 8]) {
      for (const slot of TIME_SLOTS) expect(positionsFor(n, slot, true)).not.toContain('Grill 2');
    }
  });

  it('9+ staff uses the 8-person layout', () => {
    expect(positionsFor(9, '11am-12pm', false)).toEqual(positionsFor(8, '11am-12pm', false));
  });
});

describe('hard rules', () => {
  for (const n of [5, 6, 7, 8]) {
    it(`${n} staff, everyone 11-2: full grid, no repeats, no back-to-back hot`, () => {
      const staff = crew(n);
      const r = run(staff);
      expect(r.relaxed).toBe(false);
      expect(unfilled(r.schedule)).toBe(0);
      assertRules(r.schedule, staff, '', r.relaxed);
    });
  }

  it('6 staff: somebody is hot twice (8 hot cells) but never in consecutive hours', () => {
    const r = run(crew(6));
    const hotCounts = [...perPerson(r.schedule).values()].map(d => d.filter(x => isHot(x.position)).length);
    expect(Math.max(...hotCounts)).toBe(2);
    expect(hotCounts.reduce((a, b) => a + b, 0)).toBe(8);
  });

  it('nobody is ever on Grill 1 and Grill 2 the same day', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const n of [6, 7, 8]) {
        const r = run(crew(n), { random: seeded(seed) });
        for (const [id, day] of perPerson(r.schedule)) {
          const grills = day.filter(d => stationOf(d.position) === 'Grill');
          expect(grills.length, `${id} seed ${seed} n ${n}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('the grill opener is never hot at 11am', () => {
    const staff = crew(6);
    const r = run(staff, { grillOpener: 'tonny' });
    assertRules(r.schedule, staff, 'tonny', r.relaxed);
    const first = r.schedule['11am-12pm'].find(a => a.staffId === 'tonny')!;
    expect(isHot(first.position)).toBe(false);
  });

  it('respects shift durations', () => {
    const staff = [
      person('Devin', { slots: ['11am-12pm', '12pm-1pm'] }),
      person('Tonny', { slots: ['12pm-1pm', '1pm-2pm'] }),
      person('Red'),
      person('Maddie'),
      person('Ana'),
      person('Jay', { slots: ['1pm-2pm'] }),
    ];
    const r = run(staff);
    assertRules(r.schedule, staff, '', r.relaxed);
    expect(r.schedule['1pm-2pm'].some(a => a.staffId === 'devin')).toBe(false);
    expect(r.schedule['11am-12pm'].some(a => a.staffId === 'jay')).toBe(false);
  });

  describe('each hour is sized by who is on shift that hour', () => {
    const positionsAt = (schedule: Schedule, slot: TimeSlot) => schedule[slot].map(a => a.position);

    it('6 staff, one leaves at 1pm: 1pm is the 5-person layout with nothing unfilled', () => {
      const staff = [...crew(5), person('Jay', { slots: ['11am-12pm', '12pm-1pm'] })];
      const r = run(staff);
      assertRules(r.schedule, staff, '', r.relaxed);
      expect(positionsAt(r.schedule, '11am-12pm')).toHaveLength(6);
      expect(positionsAt(r.schedule, '1pm-2pm')).toEqual(positionsFor(5, '1pm-2pm', false));
      expect(unfilled(r.schedule)).toBe(0);
    });

    it('8 staff, one leaves at 1pm: 1pm has one griller and both dish stations', () => {
      const staff = [...crew(7), person('Lee', { slots: ['11am-12pm', '12pm-1pm'] })];
      const r = run(staff);
      assertRules(r.schedule, staff, '', r.relaxed);
      const pm = positionsAt(r.schedule, '1pm-2pm');
      expect(pm).toHaveLength(7);
      expect(pm).not.toContain('Grill 2');
      expect(pm).toContain('Lobby/Dish 2');
      expect(unfilled(r.schedule)).toBe(0);
    });

    it('5 all day plus a 1pm arrival: busy hours use 5 stations, 1pm uses 6', () => {
      const staff = [...crew(5), person('Jay', { slots: ['1pm-2pm'] })];
      const r = run(staff);
      assertRules(r.schedule, staff, '', r.relaxed);
      expect(positionsAt(r.schedule, '11am-12pm')).toHaveLength(5);
      expect(positionsAt(r.schedule, '12pm-1pm')).toHaveLength(5);
      expect(positionsAt(r.schedule, '1pm-2pm')).toHaveLength(6);
      expect(unfilled(r.schedule)).toBe(0);
    });

    it('still marks UNFILLED when an hour has fewer than 5 people', () => {
      const staff = [...crew(4), person('Ana', { slots: ['11am-12pm'] }), person('Jay', { slots: ['11am-12pm'] })];
      const r = run(staff);
      // 11am: 6 on. 12pm and 1pm: 4 on, laid out for the 5-person minimum.
      expect(r.schedule['11am-12pm'].filter(a => a.staffName === UNFILLED).length).toBe(0);
      expect(r.schedule['12pm-1pm'].filter(a => a.staffName === UNFILLED).length).toBe(1);
      expect(r.schedule['1pm-2pm'].filter(a => a.staffName === UNFILLED).length).toBe(1);
    });
  });

  it('relaxes the consecutive-hot rule only when the roster leaves no other way', () => {
    // 5 stations per slot, 2 hot each. Only three people can ever be hot:
    // 6 hot cells across 3 hours for 3 people means someone MUST be hot
    // back to back.
    const staff = [
      person('Devin'),
      person('Tonny'),
      person('Red'),
      person('Maddie', { slots: ['11am-12pm'] }),
      person('Ana', { slots: ['11am-12pm'] }),
    ];
    const r = run(staff);
    expect(r.relaxed).toBe(true);
    // Even relaxed, nobody works a station twice and the 11am grid is full.
    assertRules(r.schedule, staff, '', true);
    expect(r.schedule['11am-12pm'].filter(a => a.staffName === UNFILLED).length).toBe(0);
  });
});

describe('fairness', () => {
  const dayWith = (hot: Record<string, Position>): HistoryDay => ({
    schedule: {
      '11am-12pm': Object.entries(hot).map(([staffId, position]) => ({ position, staffId, staffName: staffId })),
    },
  });

  it('a grill-lover who was hot all week yields the grill to someone who was not', () => {
    const staff = crew(6);
    // Devin loves grill but has grilled 4 of the last 4 days. Everyone else: nothing.
    staff[0] = person('Devin', { grill: 5 });
    const history = Array.from({ length: 4 }, () => dayWith({ devin: 'Grill 1' }));
    let devinGrilled = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = run(staff, { history, random: seeded(seed) });
      const day = perPerson(r.schedule).get('devin') ?? [];
      if (day.some(d => stationOf(d.position) === 'Grill')) devinGrilled++;
    }
    expect(devinGrilled).toBe(0);
  });

  it('with no history, preference decides who grills', () => {
    const staff = crew(6);
    staff[0] = person('Devin', { grill: 5 });
    let devinGrilled = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = run(staff, { random: seeded(seed) });
      const day = perPerson(r.schedule).get('devin') ?? [];
      if (day.some(d => stationOf(d.position) === 'Grill')) devinGrilled++;
    }
    expect(devinGrilled).toBe(40);
  });

  it('hot shifts even out over a week', () => {
    // 6 people, 8 hot cells a day, 7 days = 56 hot shifts. Fair share ~9.3 each.
    const staff = crew(6);
    staff[0] = person('Devin', { grill: 5, fries: 5 });
    staff[1] = person('Tonny', { grill: 1, fries: 1 });
    const history: HistoryDay[] = [];
    const rng = seeded(7);
    for (let d = 0; d < 7; d++) {
      const r = run(staff, { history, random: rng });
      history.unshift({ schedule: r.schedule });
      history.splice(7);
    }
    const totals = new Map<string, number>();
    for (const day of history) {
      for (const slot of TIME_SLOTS) {
        for (const a of day.schedule![slot] ?? []) {
          if (isHot(a.position)) totals.set(a.staffId, (totals.get(a.staffId) ?? 0) + 1);
        }
      }
    }
    const counts = [...totals.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  describe('shuffle', () => {
    // Every station rated by everyone, with the unavoidable ties (6 people,
    // 5 levels) all parked on Ana/Jay, so strict mode has almost nothing
    // for jitter to decide.
    const opinionated = (name: string, levels: number[]): RotationStaff => ({
      id: name.toLowerCase(),
      name,
      availableSlots: [...TIME_SLOTS],
      preferences: (['Grill 1', 'Fries', 'P.O.S.', 'Expo 1', 'Expo 2', 'Lobby/Dish 1'] as Position[]).map(
        (position, i) => ({ position, preferenceLevel: levels[i] as 1 | 2 | 3 | 4 | 5 }),
      ),
    });
    const crewWithOpinions = () => [
      //                      G  F  P  E1 E2 L
      opinionated('Devin',  [5, 4, 2, 1, 3, 2]),
      opinionated('Tonny',  [4, 3, 5, 2, 1, 3]),
      opinionated('Red',    [2, 5, 3, 4, 2, 1]),
      opinionated('Maddie', [3, 2, 4, 5, 4, 4]),
      opinionated('Ana',    [1, 1, 1, 3, 5, 5]),
      opinionated('Jay',    [3, 1, 1, 3, 5, 5]),
    ];
    it('moves cold stations on most presses, compared to the strict grid for the same seed', () => {
      let seedsThatMoved = 0;
      let coldCellsMoved = 0;
      let coldCells = 0;
      for (let seed = 100; seed < 120; seed++) {
        const strict = run(crewWithOpinions(), { random: seeded(seed) }).schedule;
        const shuffled = run(crewWithOpinions(), { shuffle: true, random: seeded(seed) }).schedule;
        let moved = 0;
        for (const slot of TIME_SLOTS) {
          strict[slot].forEach((a, i) => {
            if (isHot(a.position)) return;
            coldCells++;
            if (a.staffId !== shuffled[slot][i].staffId) moved++;
          });
        }
        coldCellsMoved += moved;
        if (moved > 0) seedsThatMoved++;
      }
      expect(seedsThatMoved).toBeGreaterThanOrEqual(12);
      expect(coldCellsMoved / coldCells).toBeGreaterThan(0.2);
    });

    it('never touches hot placement or the hard rules', () => {
      const staff = crewWithOpinions();
      for (let seed = 1; seed <= 30; seed++) {
        const strict = run(staff, { random: seeded(seed) });
        const shuffled = run(staff, { shuffle: true, random: seeded(seed) });
        assertRules(shuffled.schedule, staff, '', shuffled.relaxed);
        const hotOnly = (s: Schedule) =>
          TIME_SLOTS.map(slot => s[slot].filter(a => isHot(a.position)).map(a => `${a.position}=${a.staffId}`));
        expect(hotOnly(shuffled.schedule)).toEqual(hotOnly(strict.schedule));
      }
    });

    it('a cold station never goes to someone two preference levels below the best candidate', () => {
      const staff = crewWithOpinions();
      for (let seed = 1; seed <= 30; seed++) {
        const r = run(staff, { shuffle: true, random: seeded(seed) });
        for (const slot of TIME_SLOTS) {
          for (const a of r.schedule[slot]) {
            if (!a.staffId || isHot(a.position)) continue;
            const got = preferenceFor(staff.find(s => s.id === a.staffId)!.preferences, a.position);
            // Anyone who was free for this cell and rates it 2+ higher would have won.
            const takenHere = new Set(r.schedule[slot].map(x => x.staffId));
            const best = Math.max(
              ...staff.filter(s => !takenHere.has(s.id) || s.id === a.staffId).map(s => preferenceFor(s.preferences, a.position)),
            );
            expect(best - got, `${a.staffId} on ${a.position} at ${slot} (pref ${got}, best free ${best}) seed ${seed}`).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  it('is deterministic for a given random source', () => {
    const a = run(crew(7), { random: seeded(99) });
    const b = run(crew(7), { random: seeded(99) });
    expect(a).toEqual(b);
  });
});

describe('property: random rosters never break a hard rule', () => {
  it('2000 rosters of 5-8 people with mixed durations and preferences', () => {
    const rng = seeded(2026);
    // Roughly the real mix: most of the crew works the whole rush, a few
    // come late or leave early.
    const durations: TimeSlot[][] = [
      ...Array<TimeSlot[]>(8).fill(['11am-12pm', '12pm-1pm', '1pm-2pm']),
      ['11am-12pm', '12pm-1pm'],
      ['12pm-1pm', '1pm-2pm'],
      ['1pm-2pm'],
    ];
    let relaxedDays = 0;
    let fullShiftDays = 0;
    for (let t = 0; t < 2000; t++) {
      const n = 5 + Math.floor(rng() * 4);
      const staff = NAMES.slice(0, n).map(name =>
        person(name, {
          grill: 1 + Math.floor(rng() * 5),
          fries: 1 + Math.floor(rng() * 5),
          pos: 1 + Math.floor(rng() * 5),
          slots: durations[Math.floor(rng() * durations.length)],
        }),
      );
      const opener = rng() < 0.5 ? staff[Math.floor(rng() * n)].id : '';
      const slow = rng() < 0.2;
      const r = generateRotation({ staff, grillOpener: opener, oneGrillerOnly: slow, history: [], random: rng });
      if (r.relaxed) relaxedDays++;
      assertRules(r.schedule, staff, opener, r.relaxed);
      // Everyone on for the whole rush is always solvable without relaxing.
      if (staff.every(s => s.availableSlots.length === 3)) {
        fullShiftDays++;
        expect(r.relaxed, `relaxed a full-shift roster (seed step ${t})`).toBe(false);
      }
    }
    expect(fullShiftDays).toBeGreaterThan(200);
    // Relaxation is for genuinely impossible rosters (the search is
    // exhaustive, so `relaxed` means no schedule satisfied the rule). The
    // common impossible case: a 6-crew with one 1pm-only person has 5
    // people for 6 disjoint busy-hour hot cells. It should stay the
    // exception, not the rule.
    expect(relaxedDays / 2000).toBeLessThan(0.25);
  });
});
