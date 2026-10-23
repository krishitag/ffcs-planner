import { describe, it, expect } from 'vitest';
import { Constraints } from '../constraints';
import { loadCourses } from '../data/loadCourses';
import { searchCourses } from './searchCourses';
import { generate, mustWishes } from './generate';
import { relaxOptions, relaxWishes } from './relax';

// Real SCOPE courses, found the way the agent finds them.
function courses(...queries: string[]) {
  return queries.map(query => {
    const r = searchCourses({ school: 'SCOPE', query });
    if (r.status !== 'found') throw new Error(`${query}: ${r.status}`);
    const course = loadCourses().find(
      c => c.school === 'SCOPE' && c.domain === r.match.domain && c.key === r.match.key
    )!;
    return { query, course };
  });
}

describe('relaxWishes: "must" becomes "if possible", nothing is deleted', () => {
  const c = Constraints.parse({
    courses: [
      { query: 'OS', professor: { name: 'X' } },
      { query: 'CN', professor: { name: 'Y', wish: 'avoid' }, slot: { value: 'F1+TF1' } },
    ],
    freeDays: [{ day: 'Fri' }, { day: 'Wed' }],
    noClassesBefore: { time: '09:00' },
    sameBuilding: {},
  });

  it('softens exactly the chosen wishes', () => {
    const out = relaxWishes(c, [
      { kind: 'freeDay', day: 'Fri' },
      { kind: 'noClassesBefore', time: '09:00' },
      { kind: 'sameBuilding' },
      { kind: 'professor', course: 'OS', name: 'X', wish: 'must' },
      { kind: 'slot', course: 'CN', value: 'F1+TF1' },
    ]);
    expect(out.freeDays).toEqual([
      { day: 'Fri', strength: 'prefer' },
      { day: 'Wed', strength: 'must' }, // untouched
    ]);
    expect(out.noClassesBefore).toEqual({ time: '09:00', strength: 'prefer' });
    expect(out.sameBuilding).toEqual({ strength: 'prefer' });
    expect(out.courses[0].professor).toEqual({ name: 'X', wish: 'prefer' });
    expect(out.courses[1].slot).toEqual({ value: 'F1+TF1', strength: 'prefer' });
    expect(mustWishes(out)).toEqual([
      { kind: 'freeDay', day: 'Wed' },
      { kind: 'professor', course: 'CN', name: 'Y', wish: 'avoid' },
    ]);
  });

  it('removes an "avoid" wish (it has no "if possible" form)', () => {
    const out = relaxWishes(c, [{ kind: 'professor', course: 'CN', name: 'Y', wish: 'avoid' }]);
    expect(out.courses[1].professor).toBeUndefined();
  });

  it('does not change the original', () => {
    relaxWishes(c, [{ kind: 'freeDay', day: 'Fri' }]);
    expect(c.freeDays[0].strength).toBe('must');
  });
});

describe('relaxOptions on real courses', () => {
  it('one course impossible: relax the wish to blame, and count what appears', () => {
    const cs = courses('OS', 'CN');
    const constraints = Constraints.parse({ freeDays: [{ day: 'Fri' }] });
    const generated = generate({ courses: cs, constraints });
    const options = relaxOptions({ generated, courses: cs, constraints });
    expect(options).toHaveLength(1);
    expect(options[0].relax).toEqual([{ kind: 'freeDay', day: 'Fri' }]);
    expect(options[0].timetables).toBeGreaterThan(0);
  });

  it("courses clash together: uses the generator's own fixes and counts", () => {
    const cs = courses('OS', 'DBMS', 'DSA');
    const constraints = Constraints.parse({ freeDays: [{ day: 'Wed' }] });
    const generated = generate({ courses: cs, constraints });
    expect(relaxOptions({ generated, courses: cs, constraints })).toEqual([
      { relax: [{ kind: 'freeDay', day: 'Wed' }], timetables: 164 },
    ]);
  });

  it('same building impossible: offers to relax it', () => {
    const cs = courses('OS', 'CN');
    const constraints = Constraints.parse({ sameBuilding: {} });
    const generated = generate({ courses: cs, constraints });
    const options = relaxOptions({
      generated,
      rankIssue: 'same building',
      courses: cs,
      constraints,
    });
    expect(options[0].relax).toEqual([{ kind: 'sameBuilding' }]);
  });

  it('nothing to offer when timetables exist', () => {
    const cs = courses('OS');
    const constraints = Constraints.parse({});
    const generated = generate({ courses: cs, constraints });
    expect(relaxOptions({ generated, courses: cs, constraints })).toEqual([]);
  });
});
