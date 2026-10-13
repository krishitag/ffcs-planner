// The final check (step 2.6): the last gate before a timetable reaches the student.
// It re-verifies every timetable from scratch against the raw course data, sharing as little
// code as possible with the generator and ranker, so a bug there gets caught here.
// "The LLM plans, code verifies": nothing is shown unless this says ok.
import { clashMap } from '@/lib/slots';
import type { Constraints } from '../constraints';
import { toMinutes } from '../constraints';
import { loadCourses, type Course } from '../data/loadCourses';
import { sessionsOfSlotString, type Session } from '../data/slotTimes';
import { slotProblem } from '../data/validate';
import { building } from './filterRank';
import type { Option, OptionGroup } from './generate';

export type CheckResult = { ok: true } | { ok: false; problems: string[] };

type CourseRequest = { query: string; course: Course };

export function finalCheck(
  timetable: OptionGroup[],
  courses: CourseRequest[],
  constraints: Constraints
): CheckResult {
  const problems: string[] = [];
  const shown = timetable.map(g => g.members[0]); // the section shown for each course

  // 0. One group per requested course, each with at least one section.
  for (const c of courses) {
    const groups = timetable.filter(g => g.course === c.query);
    if (groups.length !== 1) problems.push(`${c.query}: expected 1 entry, found ${groups.length}`);
  }
  for (const g of timetable) if (g.members.length === 0) problems.push(`${g.course}: no section`);

  for (const g of timetable) {
    for (const m of g.members) {
      // 1. Nothing undefined or empty (the Q2 "undefined" lab row must never reach a student).
      for (const [field, value] of Object.entries({
        code: m.code,
        faculty: m.faculty,
        slot: m.slot,
      })) {
        if (!value || value.includes('undefined'))
          problems.push(`${g.course}: ${field} is "${value}"`);
      }
      // 2. Real slots on the grid (also catches a course code used as a lab slot, Q1).
      for (const s of [m.slot, m.labSlot].filter((x): x is string => !!x)) {
        const p = slotProblem(s);
        if (p) problems.push(`${g.course}: slot "${s}" ${p}`);
      }
      // 3. Offered in the data exactly like this (R8, Q2).
      const request = courses.find(c => c.query === g.course);
      if (request) problems.push(...notOffered(m, request.course));
    }
  }

  // 4. No clashes, checked two independent ways.
  problems.push(...overlaps(shown));
  problems.push(...clashMapClashes(shown));

  // 5. Every "must" wish holds, for every section offered to the student.
  problems.push(...brokenMustWishes(timetable, constraints));

  return problems.length === 0 ? { ok: true } : { ok: false, problems: [...new Set(problems)] };
}

// Keep only timetables that pass; report the rest (they should never happen; if they do,
// it's a bug in our own code, so it's logged loudly).
export function keepVerified<T extends { timetable: OptionGroup[] }>(
  ranked: T[],
  courses: CourseRequest[],
  constraints: Constraints,
  log: (msg: string) => void = console.error
): T[] {
  return ranked.filter(r => {
    const result = finalCheck(r.timetable, courses, constraints);
    if (!result.ok) log(`finalCheck rejected a timetable: ${result.problems.join('; ')}`);
    return result.ok;
  });
}

// ---- 3. Offered in the data ----------------------------------------------------------------

function notOffered(m: Option, course: Course): string[] {
  const problems: string[] = [];
  const where = `${course.code} ${m.slot} ${m.faculty}`;
  if (m.code !== course.code) problems.push(`${where}: code doesn't match the course`);

  // The theory slot (or a lab-only course's lab slot) with this professor must be a real entry.
  if (!course.entries.some(e => e.slot === m.slot && sameFaculty(e, m.faculty))) {
    problems.push(`${where}: this slot + professor isn't offered`);
  }

  if (m.courseType === 'both') {
    if (!m.labSlot) {
      problems.push(`${where}: theory + lab course without a lab`);
      return problems;
    }
    // The lab belongs to the SAME professor (Q2), from the course itself (E) or its lab course (P).
    const labEntries = course.type === 'E' ? course.entries : (labCourse(course)?.entries ?? []);
    if (!labEntries.some(e => e.slot === m.labSlot && sameFaculty(e, m.faculty))) {
      problems.push(`${where}: lab ${m.labSlot} isn't this professor's lab`);
    }
    // ...and on the opposite shift from the theory (R4).
    const theoryMorning = m.slot.split('+')[0].endsWith('1');
    const labMorning = Number(m.labSlot.split('+')[0].slice(1)) <= 30;
    if (theoryMorning === labMorning)
      problems.push(`${where}: lab ${m.labSlot} is on the same shift`);
  }
  return problems;
}

// Soft-skills names are shown as "company (room)" (Q8); others are the plain name.
function sameFaculty(e: { faculty: string; venue?: string }, shown: string): boolean {
  return e.faculty === shown || `${e.faculty} (${e.venue})` === shown;
}

function labCourse(theory: Course): Course | undefined {
  const base = theory.code.slice(0, -1);
  return loadCourses().find(
    c =>
      c.school === theory.school &&
      c.domain === theory.domain &&
      c.code !== theory.code &&
      c.code.slice(0, -1) === base &&
      (c.type === 'P' || c.type === 'E')
  );
}

// ---- 4. Clashes ----------------------------------------------------------------------------

// Real time overlap between any two sessions of different courses (NIL has no sessions).
function overlaps(shown: Option[]): string[] {
  const problems: string[] = [];
  const all = shown.flatMap(m => sessionsOf(m).map(s => ({ course: m.course, s })));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.course === b.course) continue;
      if (a.s.day === b.s.day && a.s.start < b.s.end && b.s.start < a.s.end) {
        problems.push(
          `clash on ${a.s.day}: ${a.course} (${a.s.slot}) and ${b.course} (${b.s.slot})`
        );
      }
    }
  }
  return problems;
}

// The website's own clash table, as a second opinion: the same slot twice, or a pair the
// table says clash.
function clashMapClashes(shown: Option[]): string[] {
  const problems: string[] = [];
  const parts = shown.map(m => ({
    course: m.course,
    slots: [...m.slot.split('+'), ...(m.labSlot?.split('+') ?? [])].filter(s => s !== 'NIL'),
  }));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      for (const a of parts[i].slots) {
        for (const b of parts[j].slots) {
          if (a === b || clashMap[a]?.includes(b) || clashMap[b]?.includes(a)) {
            problems.push(`clashMap: ${parts[i].course} (${a}) and ${parts[j].course} (${b})`);
          }
        }
      }
    }
  }
  return problems;
}

// Sessions worked out again from the slot strings, not taken from the generator's option.
function sessionsOf(m: Option): Session[] {
  return [...sessionsOfSlotString(m.slot), ...(m.labSlot ? sessionsOfSlotString(m.labSlot) : [])];
}

// ---- 5. Must wishes ------------------------------------------------------------------------

function brokenMustWishes(timetable: OptionGroup[], c: Constraints): string[] {
  const problems: string[] = [];
  const shown = timetable.map(g => g.members[0]);
  const sessions = shown.flatMap(sessionsOf);
  const fmt = (s: Session) => `${s.day} ${s.slot}`;

  for (const f of c.freeDays) {
    if (f.strength !== 'must') continue;
    const bad = sessions.filter(s => s.day === f.day);
    if (bad.length) problems.push(`${f.day} should be free: ${bad.map(fmt).join(', ')}`);
  }
  if (c.noClassesBefore?.strength === 'must') {
    const bad = sessions.filter(s => s.start < toMinutes(c.noClassesBefore!.time));
    if (bad.length)
      problems.push(`class before ${c.noClassesBefore.time}: ${bad.map(fmt).join(', ')}`);
  }
  if (c.noClassesAfter?.strength === 'must') {
    const bad = sessions.filter(s => s.end > toMinutes(c.noClassesAfter!.time));
    if (bad.length)
      problems.push(`class after ${c.noClassesAfter.time}: ${bad.map(fmt).join(', ')}`);
  }
  if (c.shift?.strength === 'must') {
    for (const m of shown) {
      const first = m.slot.split('+')[0];
      if (first === 'NIL') continue;
      const morning = m.courseType === 'lab' ? Number(first.slice(1)) <= 30 : first.endsWith('1');
      if (morning !== (c.shift.value === 'morning')) {
        problems.push(`${m.course} (${m.slot}) isn't in the ${c.shift.value}`);
      }
    }
  }
  for (const wish of c.courses) {
    const g = timetable.find(x => x.course === wish.query);
    if (!g) continue;
    const p = wish.professor;
    if (p && p.wish !== 'prefer') {
      for (const m of g.members) {
        const teaches = m.faculty.toLowerCase().includes(p.name.toLowerCase());
        if (p.wish === 'must' && !teaches)
          problems.push(`${wish.query}: ${m.faculty} isn't ${p.name}`);
        if (p.wish === 'avoid' && teaches)
          problems.push(`${wish.query}: ${m.faculty} should be avoided`);
      }
    }
    if (wish.slot?.strength === 'must') {
      const parts = [...g.slot.split('+'), ...(g.labSlot?.split('+') ?? [])];
      if (!wish.slot.value.split('+').every(s => parts.includes(s))) {
        problems.push(`${wish.query} should be in ${wish.slot.value}, is in ${g.slot}`);
      }
    }
  }
  if (c.sameBuilding?.strength === 'must') {
    const buildings = new Set(shown.map(m => building(m.venue)).filter(Boolean));
    if (buildings.size > 1) problems.push(`not in one building: ${[...buildings].join(', ')}`);
  }
  return problems;
}
