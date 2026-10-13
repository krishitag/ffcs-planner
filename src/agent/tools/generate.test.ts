// Spec for tools/generate.ts (step 2.4). Rules: D11 in PLAN.md.
import { describe, it, expect } from 'vitest';
import { loadCourses, type Course } from '../data/loadCourses';
import { Constraints } from '../constraints';
import { mustWishes, optionsFor, breaks, generate, type OptionGroup } from './generate';

const all = loadCourses();
const course = (school: string, code: string, domain = 'DisciplineCore'): Course =>
  all.find(c => c.school === school && c.code === code && c.domain === domain)!;
const OS = course('SCOPE', 'BCSE303L'); // slots B1+TB1 / B2+TB2, 48 options
const CN = course('SCOPE', 'BCSE308L'); // slots F1+TF1 / F2+TF2
const BSTS = course('SCOPE', 'BSTS301P', 'OpenElective'); // 103 sections, 4 slots
const NIL_COURSE = course('SHINE', 'BSSC102N', 'NGCR'); // online course, slot NIL

const everySession = (timetables: OptionGroup[][]) =>
  timetables.flat().flatMap(g => g.members.flatMap(m => m.sessions));

describe('mustWishes: only the "must" wishes filter options', () => {
  it('keeps must and avoid, drops prefer', () => {
    const c = Constraints.parse({
      courses: [
        { query: 'OS', professor: { name: 'Manivannan' } },
        { query: 'CN', professor: { name: 'Someone', wish: 'prefer' } },
        { query: 'DBMS', professor: { name: 'Nobody', wish: 'avoid' } },
      ],
      freeDays: [{ day: 'Fri' }],
      noClassesAfter: { time: '17:00', strength: 'prefer' },
    });
    const kinds = mustWishes(c).map(w => w.kind);
    expect(kinds).toContain('freeDay');
    expect(kinds.filter(k => k === 'professor')).toHaveLength(2); // OS must + DBMS avoid
    expect(kinds).not.toContain('noClassesAfter'); // it was only "prefer"
  });
});

describe('optionsFor: every option of a course, with its sessions', () => {
  it('lists each theory slot + professor + lab slot as one option, with real sessions', () => {
    const options = optionsFor('OS', OS);
    expect(options).toHaveLength(48);
    for (const o of options) {
      expect(o.labSlot).toBeDefined(); // theory + lab course: the lab comes with the professor
      expect(o.sessions.length).toBeGreaterThanOrEqual(3); // B1 twice + TB1 + the lab
    }
  });

  it('gives a NIL course an option with no sessions', () => {
    const options = optionsFor('Constitution', NIL_COURSE);
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].sessions).toEqual([]);
  });
});

describe('breaks: does one option break one must wish?', () => {
  const b1 = optionsFor('OS', OS).find(o => o.slot === 'B1+TB1')!; // B1 = Tue 08:00 and Thu 09:00

  it('"no 8am" is broken by an 8:00 class', () => {
    expect(breaks(b1, { kind: 'noClassesBefore', time: '09:00' })).toBe(true);
  });

  it('a free day is broken by any class or lab that day', () => {
    expect(breaks(b1, { kind: 'freeDay', day: 'Tue' })).toBe(true);
  });

  it('"mornings only" looks at the theory slot only, not the evening lab (D11)', () => {
    expect(breaks(b1, { kind: 'shift', value: 'morning' })).toBe(false);
  });

  it('a slot wish "B1" matches the option "B1+TB1" (D11)', () => {
    expect(breaks(b1, { kind: 'slot', course: 'OS', value: 'B1' })).toBe(false);
    expect(breaks(b1, { kind: 'slot', course: 'OS', value: 'B2' })).toBe(true);
  });

  it('a wish about another course never breaks this one', () => {
    expect(breaks(b1, { kind: 'slot', course: 'CN', value: 'F2' })).toBe(false);
  });

  it('a NIL course never breaks a day or time wish (R6)', () => {
    const nil = optionsFor('Constitution', NIL_COURSE)[0];
    expect(breaks(nil, { kind: 'noClassesBefore', time: '09:00' })).toBe(false);
    expect(breaks(nil, { kind: 'freeDay', day: 'Mon' })).toBe(false);
  });
});

describe('generate: filter, group, generate', () => {
  it('makes clash-free timetables with no wishes, and grouping only shrinks the search', () => {
    const r = generate({
      courses: [
        { query: 'OS', course: OS },
        { query: 'CN', course: CN },
      ],
      constraints: Constraints.parse({}),
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.timetables.length).toBeGreaterThan(0);
    expect(r.timetables[0]).toHaveLength(2); // one group per course
    expect(r.combinations.after).toBeLessThanOrEqual(r.combinations.before);
  });

  it('obeys "no 8am" for theory AND labs', () => {
    const c = Constraints.parse({ noClassesBefore: { time: '09:00' } });
    const r = generate({
      courses: [
        { query: 'OS', course: OS },
        { query: 'CN', course: CN },
      ],
      constraints: c,
    });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(everySession(r.timetables).every(s => s.start >= 540)).toBe(true);
  });

  it('obeys "keep Friday free" (OS alone can free Wed or Fri only)', () => {
    const c = Constraints.parse({ freeDays: [{ day: 'Fri' }] });
    const r = generate({ courses: [{ query: 'OS', course: OS }], constraints: c });
    expect(r.status).toBe('ok');
    if (r.status === 'ok')
      expect(everySession(r.timetables).some(s => s.day === 'Fri')).toBe(false);
  });

  it('obeys a "must" professor and an "avoid" professor', () => {
    const must = Constraints.parse({
      courses: [{ query: 'OS', professor: { name: 'manivannan' } }],
    });
    const r1 = generate({ courses: [{ query: 'OS', course: OS }], constraints: must });
    expect(r1.status).toBe('ok');
    if (r1.status === 'ok') {
      expect(
        r1.timetables
          .flat()
          .flatMap(g => g.members)
          .every(m => m.faculty.includes('MANIVANNAN'))
      ).toBe(true);
    }
    const avoid = Constraints.parse({
      courses: [{ query: 'OS', professor: { name: 'manivannan', wish: 'avoid' } }],
    });
    const r2 = generate({ courses: [{ query: 'OS', course: OS }], constraints: avoid });
    if (r2.status === 'ok') {
      expect(
        r2.timetables
          .flat()
          .flatMap(g => g.members)
          .some(m => m.faculty.includes('MANIVANNAN'))
      ).toBe(false);
    }
  });

  it('groups same-slot sections: soft skills become one group per slot (93x rule)', () => {
    const r = generate({
      courses: [{ query: 'soft skills', course: BSTS }],
      constraints: Constraints.parse({}),
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.timetables).toHaveLength(4); // 4 distinct slots
    expect(r.timetables.flat().reduce((n, g) => n + g.members.length, 0)).toBe(103); // nobody lost
  });

  it('stops instead of freezing when there are too many combinations', () => {
    const r = generate({
      courses: [
        { query: 'OS', course: OS },
        { query: 'CN', course: CN },
      ],
      constraints: Constraints.parse({}),
      maxCombinations: 1,
    });
    expect(r.status).toBe('tooMany');
  });
});

describe('generate: explaining why a course has no options (smallest conflict, D11)', () => {
  it('one wish alone: OS has no A1 slot', () => {
    const c = Constraints.parse({ courses: [{ query: 'OS', slot: { value: 'A1' } }] });
    const r = generate({ courses: [{ query: 'OS', course: OS }], constraints: c });
    expect(r.status).toBe('courseImpossible');
    if (r.status !== 'courseImpossible') return;
    expect(r.course).toBe('OS');
    expect(r.conflict).toEqual([{ kind: 'slot', course: 'OS', value: 'A1' }]);
  });

  it('only together: "mornings only" + "no 8am" kill OS (its morning slot B1 is Tue 08:00)', () => {
    const c = Constraints.parse({
      shift: { value: 'morning' },
      noClassesBefore: { time: '09:00' },
    });
    const r = generate({
      courses: [
        { query: 'CN', course: CN },
        { query: 'OS', course: OS },
      ],
      constraints: c,
    });
    expect(r.status).toBe('courseImpossible');
    if (r.status !== 'courseImpossible') return;
    expect(r.course).toBe('OS'); // CN survives both (F1+TF1)
    expect(r.conflict).toHaveLength(2); // neither wish alone is enough
    expect(r.conflict).toEqual(
      expect.arrayContaining([
        { kind: 'shift', value: 'morning' },
        { kind: 'noClassesBefore', time: '09:00' },
      ])
    );
  });

  it('a free day one course can never have: CN has a Friday class in every option', () => {
    const c = Constraints.parse({ freeDays: [{ day: 'Fri' }] });
    const r = generate({
      courses: [
        { query: 'OS', course: OS },
        { query: 'CN', course: CN },
      ],
      constraints: c,
    });
    expect(r.status).toBe('courseImpossible');
    if (r.status !== 'courseImpossible') return;
    expect(r.course).toBe('CN');
    expect(r.conflict).toEqual([{ kind: 'freeDay', day: 'Fri' }]);
  });

  it('a free day each course can have alone, but not together: suggests dropping it', () => {
    const DBMS = course('SCOPE', 'BCSE302L');
    const DSA = course('SCOPE', 'BCSE202L');
    const c = Constraints.parse({ freeDays: [{ day: 'Wed' }] });
    const r = generate({
      courses: [
        { query: 'OS', course: OS },
        { query: 'DBMS', course: DBMS },
        { query: 'DSA', course: DSA },
      ],
      constraints: c,
    });
    expect(r.status).toBe('noTimetable');
    if (r.status !== 'noTimetable') return;
    expect(r.fixes).toHaveLength(1);
    expect(r.fixes[0].drop).toEqual([{ kind: 'freeDay', day: 'Wed' }]);
    expect(r.fixes[0].timetables).toBeGreaterThan(0); // 164 with today's data
  });
});
