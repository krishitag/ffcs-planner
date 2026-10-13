// The generator wrapper (step 2.4). Before calling FFCS-inator's own generateTT it:
//   1. removes every option that breaks a "must" wish (D11),
//   2. groups options with the same slots (they differ only by professor/room: the 93x rule),
//   3. refuses if there would still be too many combinations.
// When nothing fits, it explains why with the smallest set of wishes to blame, so the relax
// step can ask the student which one to drop.
import { generateTT } from '@/lib/utils';
import type { fullCourseData } from '@/lib/type';
import type { Course } from '../data/loadCourses';
import { toFullCourseData } from '../data/toFullCourseData';
import { sessionsOfSlotString, type Session, type Day } from '../data/slotTimes';
import { toMinutes, type Constraints } from '../constraints';

// One "must" wish, flattened out of Constraints.
export type MustWish =
  | { kind: 'freeDay'; day: Day }
  | { kind: 'noClassesBefore'; time: string }
  | { kind: 'noClassesAfter'; time: string }
  | { kind: 'shift'; value: 'morning' | 'evening' }
  | { kind: 'professor'; course: string; name: string; wish: 'must' | 'avoid' }
  | { kind: 'slot'; course: string; value: string };

// One pickable option: a theory slot + professor (+ that professor's lab).
export type Option = {
  course: string; // the student's query, e.g. "OS"
  code: string; // "BCSE303L"
  courseType: 'th' | 'lab' | 'both';
  slot: string; // "B1+TB1" (for a lab-only course: its lab slot)
  labSlot?: string; // "L37+L38"
  faculty: string;
  venue?: string;
  sessions: Session[]; // theory + lab sessions together
};

// Options with the exact same slot + lab slot: identical for clashes and times.
export type OptionGroup = { course: string; slot: string; labSlot?: string; members: Option[] };

// A way out when no timetable fits: drop these wishes and this many timetables appear.
export type Fix = { drop: MustWish[]; timetables: number };

export type GenerateResult =
  | { status: 'ok'; timetables: OptionGroup[][]; combinations: { before: number; after: number } }
  // A course has no option left. `conflict` = the smallest set of wishes that together cause
  // it ([] when the course has no options even with no wishes, e.g. Q10 courses).
  | { status: 'courseImpossible'; course: string; conflict: MustWish[] }
  | { status: 'tooMany'; combinations: number; limit: number }
  // Every course has options, but they clash together. `fixes` = the smallest sets of wishes
  // whose removal gives timetables ([] if even no wishes would help: the courses just clash).
  | { status: 'noTimetable'; clashes: string | null; fixes: Fix[] };

type CourseRequest = { query: string; course: Course };

// ---- Step 2: the "must" wishes ------------------------------------------------------------

export function mustWishes(c: Constraints): MustWish[] {
  const wishes: MustWish[] = [];
  for (const f of c.freeDays)
    if (f.strength === 'must') wishes.push({ kind: 'freeDay', day: f.day });
  if (c.noClassesBefore?.strength === 'must') {
    wishes.push({ kind: 'noClassesBefore', time: c.noClassesBefore.time });
  }
  if (c.noClassesAfter?.strength === 'must') {
    wishes.push({ kind: 'noClassesAfter', time: c.noClassesAfter.time });
  }
  if (c.shift?.strength === 'must') wishes.push({ kind: 'shift', value: c.shift.value });
  for (const wanted of c.courses) {
    const p = wanted.professor;
    if (p && (p.wish === 'must' || p.wish === 'avoid')) {
      wishes.push({ kind: 'professor', course: wanted.query, name: p.name, wish: p.wish });
    }
    if (wanted.slot?.strength === 'must') {
      wishes.push({ kind: 'slot', course: wanted.query, value: wanted.slot.value });
    }
  }
  return wishes;
}

// ---- Step 3: every option of a course -----------------------------------------------------

export function optionsFor(query: string, course: Course): Option[] {
  const full = toFullCourseData(course).course;
  if (!full) return []; // the website offers nothing to pick (Q10)

  const options: Option[] = [];
  for (const slot of full.courseSlots) {
    for (const f of slot.slotFaculties) {
      // A theory + lab professor may have several labs: one option per lab (Q2).
      const labs: (string | undefined)[] =
        full.courseType === 'both' && f.facultyLabSlot ? f.facultyLabSlot.split(', ') : [undefined];
      for (const labSlot of labs) {
        options.push({
          course: query,
          code: full.courseCode,
          courseType: full.courseType,
          slot: slot.slotName,
          labSlot,
          faculty: f.facultyName,
          venue: f.venue,
          sessions: [
            ...sessionsOfSlotString(slot.slotName),
            ...(labSlot ? sessionsOfSlotString(labSlot) : []),
          ],
        });
      }
    }
  }
  return options;
}

// ---- Step 4: does one option break one wish? ----------------------------------------------

export function breaks(option: Option, wish: MustWish): boolean {
  switch (wish.kind) {
    case 'freeDay':
      return option.sessions.some(s => s.day === wish.day);
    case 'noClassesBefore':
      return option.sessions.some(s => s.start < toMinutes(wish.time));
    case 'noClassesAfter':
      return option.sessions.some(s => s.end > toMinutes(wish.time));
    case 'shift': {
      const shift = shiftOf(option);
      return shift !== null && shift !== wish.value;
    }
    case 'professor': {
      if (wish.course !== option.course) return false;
      const teaches = option.faculty.toLowerCase().includes(wish.name.toLowerCase());
      return wish.wish === 'must' ? !teaches : teaches;
    }
    case 'slot': {
      if (wish.course !== option.course) return false;
      const parts = [...option.slot.split('+'), ...(option.labSlot?.split('+') ?? [])];
      return !wish.value.split('+').every(p => parts.includes(p));
    }
  }
}

// D11: a lab-only course is judged by its lab; everything else by its theory slot (its lab is
// always on the other shift, R4). NIL has no shift.
function shiftOf(option: Option): 'morning' | 'evening' | null {
  const first = option.slot.split('+')[0];
  if (first === 'NIL') return null;
  if (option.courseType === 'lab') return Number(first.slice(1)) <= 30 ? 'morning' : 'evening';
  return first.endsWith('1') ? 'morning' : 'evening';
}

// ---- Step 5 and 6: filter, explain, group, generate ---------------------------------------

export function generate({
  courses,
  constraints,
  maxCombinations = 200_000,
}: {
  courses: CourseRequest[];
  constraints: Constraints;
  maxCombinations?: number;
}): GenerateResult {
  const wishes = mustWishes(constraints);
  const allOptions = courses.map(c => optionsFor(c.query, c.course));

  // A course with nothing left: blame the smallest set of wishes (D11).
  for (let i = 0; i < courses.length; i++) {
    if (survivors(allOptions[i], wishes).length === 0) {
      return {
        status: 'courseImpossible',
        course: courses[i].query,
        conflict: smallestConflict(allOptions[i], wishes),
      };
    }
  }

  const before = product(allOptions.map(o => o.length));
  const run = runWith(courses, allOptions, wishes, maxCombinations);
  if (run.status !== 'noTimetable') {
    return run.status === 'ok' ? { ...run, combinations: { ...run.combinations, before } } : run;
  }

  // Nothing fits together: which wishes, if dropped, would give timetables?
  return { ...run, fixes: findFixes(courses, allOptions, wishes, maxCombinations) };
}

function survivors(options: Option[], wishes: MustWish[]): Option[] {
  return options.filter(o => wishes.every(w => !breaks(o, w)));
}

// Each wish alone, then each pair; otherwise every wish that touches the course.
function smallestConflict(options: Option[], wishes: MustWish[]): MustWish[] {
  if (options.length === 0) return [];
  for (const w of wishes) if (survivors(options, [w]).length === 0) return [w];
  for (let i = 0; i < wishes.length; i++) {
    for (let j = i + 1; j < wishes.length; j++) {
      if (survivors(options, [wishes[i], wishes[j]]).length === 0) return [wishes[i], wishes[j]];
    }
  }
  return wishes.filter(w => options.some(o => breaks(o, w)));
}

// Drop each wish alone, then each pair, and keep the drops that give timetables.
function findFixes(
  courses: CourseRequest[],
  allOptions: Option[][],
  wishes: MustWish[],
  limit: number
): Fix[] {
  const tryDrop = (drop: MustWish[]): Fix | null => {
    const kept = wishes.filter(w => !drop.includes(w));
    if (allOptions.some(o => survivors(o, kept).length === 0)) return null;
    const r = runWith(courses, allOptions, kept, limit);
    return r.status === 'ok' ? { drop, timetables: r.timetables.length } : null;
  };
  const singles = wishes.map(w => tryDrop([w])).filter((f): f is Fix => f !== null);
  if (singles.length > 0) return singles;
  const pairs: Fix[] = [];
  for (let i = 0; i < wishes.length; i++) {
    for (let j = i + 1; j < wishes.length; j++) {
      const f = tryDrop([wishes[i], wishes[j]]);
      if (f) pairs.push(f);
    }
  }
  return pairs;
}

// Filter by the wishes, group, check the size, run generateTT and map the result back.
function runWith(
  courses: CourseRequest[],
  allOptions: Option[][],
  wishes: MustWish[],
  limit: number
): Exclude<GenerateResult, { status: 'courseImpossible' }> {
  const groupsPerCourse = allOptions.map(options => groupBySlots(survivors(options, wishes)));
  const after = product(groupsPerCourse.map(g => g.size));
  if (after > limit) return { status: 'tooMany', combinations: after, limit };

  // R6: a course whose every option is NIL (projects, online courses) has no classes, so it
  // can't clash with anything, not even another NIL course. generateTT would compare the text
  // "NIL" with "NIL" and call that a clash, so NIL-only courses are kept out of it and added
  // back to every timetable afterwards.
  const isNilOnly = (i: number) => [...groupsPerCourse[i].values()].every(g => g.slot === 'NIL');
  const timed = courses.map((_, i) => i).filter(i => !isNilOnly(i));

  // One representative per group, in the shape generateTT expects.
  const input: fullCourseData[] = timed.map(i =>
    representativeCourse(courses[i].course, [...groupsPerCourse[i].values()])
  );
  const { result, clashes } =
    input.length > 0 ? generateTT(input, true) : { result: [[]], clashes: null };
  if (result.length === 0) return { status: 'noTimetable', clashes, fixes: [] };

  // generateTT returns rows in course order; a theory + lab course has two rows in a row
  // (theory, then lab). Turn each timetable back into one group per course.
  const timetables = result.map(rows => {
    const picked: OptionGroup[] = [];
    let r = 0;
    for (let i = 0; i < courses.length; i++) {
      const groups = groupsPerCourse[i];
      if (isNilOnly(i)) {
        picked.push(groups.values().next().value!);
        continue;
      }
      const sample = groups.values().next().value!.members[0];
      const theory = rows[r++];
      const lab = sample.courseType === 'both' ? rows[r++] : undefined;
      picked.push(groups.get(groupKey(theory.slotName, lab?.slotName))!);
    }
    return picked;
  });
  return { status: 'ok', timetables, combinations: { before: after, after } };
}

function groupKey(slot: string, labSlot?: string): string {
  return `${slot}|${labSlot ?? ''}`;
}

function groupBySlots(options: Option[]): Map<string, OptionGroup> {
  const groups = new Map<string, OptionGroup>();
  for (const o of options) {
    const key = groupKey(o.slot, o.labSlot);
    const group = groups.get(key);
    if (group) group.members.push(o);
    else groups.set(key, { course: o.course, slot: o.slot, labSlot: o.labSlot, members: [o] });
  }
  return groups;
}

// The course with only one option per group, so generateTT tries each slot combination once.
function representativeCourse(course: Course, groups: OptionGroup[]): fullCourseData {
  const full = toFullCourseData(course).course!;
  const bySlot = new Map<string, fullCourseData['courseSlots'][number]>();
  for (const g of groups) {
    const rep = g.members[0];
    const slot = bySlot.get(g.slot) ?? { slotName: g.slot, slotFaculties: [] };
    slot.slotFaculties.push({
      facultyName: rep.faculty,
      ...(g.labSlot ? { facultyLabSlot: g.labSlot } : {}),
      ...(rep.venue ? { venue: rep.venue } : {}),
    });
    bySlot.set(g.slot, slot);
  }
  return { ...full, courseSlots: [...bySlot.values()] };
}

function product(numbers: number[]): number {
  return numbers.reduce((p, n) => p * n, 1);
}
