import { describe, it, expect } from 'vitest';
import { loadCourses } from '../data/loadCourses';
import { Constraints } from '../constraints';
import { generate, type OptionGroup } from './generate';
import { filterRank } from './filterRank';
import { finalCheck, keepVerified } from './finalCheck';

const all = loadCourses();
const course = (code: string, domain = 'DisciplineCore', school = 'SCOPE') =>
  all.find(c => c.school === school && c.code === code && c.domain === domain)!;

const requests = [
  { query: 'OS', course: course('BCSE303L') },
  { query: 'CN', course: course('BCSE308L') },
  { query: 'WP', course: course('BCSE203E') }, // embedded (E)
];
const none = Constraints.parse({});

const generated = generate({ courses: requests, constraints: none });
if (generated.status !== 'ok') throw new Error('setup: should generate');
const good = generated.timetables[0];

// Copy a timetable and change one course's shown section.
const tamper = (t: OptionGroup[], q: string, change: object): OptionGroup[] =>
  t.map(g => (g.course === q ? { ...g, members: [{ ...g.members[0], ...change }] } : g));

describe('finalCheck: real timetables pass', () => {
  it('every timetable the generator made passes (theory + lab and embedded courses)', () => {
    for (const t of generated.timetables)
      expect(finalCheck(t, requests, none)).toEqual({ ok: true });
  });

  it('the ranked results pass with must wishes too', () => {
    const wishes = Constraints.parse({ noClassesBefore: { time: '09:00' } });
    const g = generate({ courses: requests.slice(0, 2), constraints: wishes });
    if (g.status !== 'ok') throw new Error('setup');
    const r = filterRank(g.timetables, wishes);
    if (r.status !== 'ok') throw new Error('setup');
    expect(keepVerified(r.ranked, requests.slice(0, 2), wishes)).toHaveLength(r.ranked.length);
  });
});

describe('finalCheck: catches anything wrong', () => {
  const fails = (t: OptionGroup[], c = none, reqs = requests) => {
    const r = finalCheck(t, reqs, c);
    return r.ok ? [] : r.problems;
  };

  it('a clash between two courses (found by time overlap and by clashMap)', () => {
    const os = good.find(g => g.course === 'OS')!;
    const clash = tamper(good, 'CN', { slot: os.slot, sessions: os.members[0].sessions });
    const problems = fails(clash);
    expect(problems.some(p => p.startsWith('clash on'))).toBe(true);
    expect(problems.some(p => p.startsWith('clashMap'))).toBe(true);
  });

  it('a slot that is not on the grid', () => {
    expect(fails(tamper(good, 'OS', { slot: 'Z9' })).some(p => p.includes('"Z9"'))).toBe(true);
  });

  it('a course code used as a lab slot (Q1)', () => {
    expect(fails(tamper(good, 'OS', { labSlot: 'BCSE303L' })).length).toBeGreaterThan(0);
  });

  it('a professor who does not teach that slot (R8)', () => {
    const problems = fails(tamper(good, 'OS', { faculty: 'NOT A REAL PROF' }));
    expect(problems.some(p => p.includes("isn't offered"))).toBe(true);
  });

  it('a lab that belongs to a different professor (Q2)', () => {
    const os = good.find(g => g.course === 'OS')!.members[0];
    const other = generated.timetables
      .flat()
      .find(g => g.course === 'OS' && g.labSlot !== os.labSlot && g.slot === os.slot)!;
    const problems = fails(tamper(good, 'OS', { labSlot: other.labSlot }));
    expect(problems.some(p => p.includes("isn't this professor's lab"))).toBe(true);
  });

  it('an "undefined" name (the Q2 embedded lab row must never reach a student)', () => {
    expect(
      fails(tamper(good, 'WP', { code: 'undefined' })).some(p => p.includes('undefined'))
    ).toBe(true);
  });

  it('a broken must wish: a class at 08:00 with "no 8am"', () => {
    const wishes = Constraints.parse({ noClassesBefore: { time: '09:00' } });
    const early = generated.timetables.find(t =>
      t.some(g => g.members[0].sessions.some(s => s.start < 540))
    )!;
    expect(fails(early, wishes).some(p => p.startsWith('class before 09:00'))).toBe(true);
  });

  it('a missing course', () => {
    expect(fails(good.filter(g => g.course !== 'CN')).some(p => p.startsWith('CN:'))).toBe(true);
  });

  it('keepVerified drops a bad timetable and logs why', () => {
    const logged: string[] = [];
    const kept = keepVerified(
      [{ timetable: good }, { timetable: tamper(good, 'OS', { slot: 'Z9' }) }],
      requests,
      none,
      m => logged.push(m)
    );
    expect(kept).toHaveLength(1);
    expect(logged[0]).toMatch(/finalCheck rejected/);
  });
});
