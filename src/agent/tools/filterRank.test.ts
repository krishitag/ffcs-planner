import { describe, it, expect } from 'vitest';
import { loadCourses } from '../data/loadCourses';
import { Constraints } from '../constraints';
import { generate, type OptionGroup } from './generate';
import { filterRank, building } from './filterRank';

const all = loadCourses();
const course = (code: string) =>
  all.find(c => c.school === 'SCOPE' && c.code === code && c.domain === 'DisciplineCore')!;

// Real timetables for OS + CN (no must wishes), as 2.4 produces them.
const generated = generate({
  courses: [
    { query: 'OS', course: course('BCSE303L') },
    { query: 'CN', course: course('BCSE308L') },
  ],
  constraints: Constraints.parse({}),
});
if (generated.status !== 'ok') throw new Error('setup: OS + CN should generate');
const timetables = generated.timetables;

const rank = (wishes: object) => {
  const r = filterRank(timetables, Constraints.parse(wishes));
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`);
  return r.ranked;
};
const groupFor = (t: OptionGroup[], q: string) => t.find(g => g.course === q)!;

describe('filterRank', () => {
  it('with no wishes, invents no preferences: every score is 0 (R4)', () => {
    const ranked = rank({});
    expect(ranked).toHaveLength(3);
    expect(ranked.every(r => r.score === 0 && r.reasons.length === 0)).toBe(true);
  });

  it('a preferred professor ranks first, puts them first in their group, and says why', () => {
    // BRISILLA R M teaches CN only in F2+TF2
    const [best] = rank({
      courses: [{ query: 'CN', professor: { name: 'Brisilla', wish: 'prefer' } }],
    });
    const cn = groupFor(best.timetable, 'CN');
    expect(cn.slot).toBe('F2+TF2');
    expect(cn.members[0].faculty).toBe('BRISILLA R M');
    expect(best.reasons).toContainEqual({ points: 2, text: 'Brisilla for CN' });
  });

  it('a professor preference outweighs a time preference (D12: professors count double)', () => {
    // F2+TF2 has a class until 17:50 on Friday, so "nothing after 17:00" prefers F1+TF1.
    const [best] = rank({
      courses: [{ query: 'CN', professor: { name: 'Brisilla', wish: 'prefer' } }],
      noClassesAfter: { time: '17:00', strength: 'prefer' },
    });
    expect(groupFor(best.timetable, 'CN').members[0].faculty).toBe('BRISILLA R M');
  });

  it('a time preference picks the timetable with fewest late classes, listing them', () => {
    const ranked = rank({ noClassesAfter: { time: '17:00', strength: 'prefer' } });
    const late = (t: OptionGroup[]) =>
      t.flatMap(g => g.members[0].sessions).filter(s => s.end > 17 * 60).length;
    expect(late(ranked[0].timetable)).toBeLessThanOrEqual(late(ranked[1].timetable));
    const worst = rank({ noClassesAfter: { time: '09:00', strength: 'prefer' } })[0];
    expect(worst.reasons[0].text).toMatch(/broken by/);
    expect(worst.reasons[0].points).toBeLessThan(1);
  });

  it('the top 3 are real choices: no two share every theory slot and professor (D12)', () => {
    const sig = (t: OptionGroup[]) =>
      t
        .map(
          g =>
            `${g.slot}:${g.members
              .map(m => m.faculty)
              .sort()
              .join(',')}`
        )
        .join('|');
    const ranked = rank({});
    expect(new Set(ranked.map(r => sig(r.timetable))).size).toBe(ranked.length);
  });

  it('a "must" same building is impossible for OS + CN (OS is all PRP, CN is all SJT)', () => {
    const r = filterRank(timetables, Constraints.parse({ sameBuilding: {} }));
    expect(r).toEqual({ status: 'noneLeft', reason: 'same building' });
  });

  it('a "must" same building keeps only sections in one shared building (OS + DBMS → PRP)', () => {
    const g = generate({
      courses: [
        { query: 'OS', course: course('BCSE303L') },
        { query: 'DBMS', course: course('BCSE302L') },
      ],
      constraints: Constraints.parse({}),
    });
    if (g.status !== 'ok') throw new Error('setup: OS + DBMS should generate');
    const r = filterRank(g.timetables, Constraints.parse({ sameBuilding: {} }));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    for (const t of r.ranked) {
      const buildings = new Set(t.timetable.flatMap(x => x.members.map(m => building(m.venue))));
      expect([...buildings]).toEqual(['PRP']);
    }
  });
});

describe('building (D12)', () => {
  it('reads the building from a venue', () => {
    expect(building('SJT508')).toBe('SJT');
    expect(building('PRP350')).toBe('PRP');
    expect(building('TT306')).toBe('TT');
  });

  it('treats the G (ground floor) suffix and SJTA as the same building', () => {
    expect(building('SJTG01')).toBe('SJT');
    expect(building('SJTA102')).toBe('SJT');
    expect(building('SMVG12')).toBe('SMV');
    expect(building('GDNG07')).toBe('GDN');
  });

  it('has no building for NIL or a missing venue', () => {
    expect(building('NIL')).toBeUndefined();
    expect(building(undefined)).toBeUndefined();
  });
});
