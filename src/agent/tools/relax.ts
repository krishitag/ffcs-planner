// When nothing fits (step 4.4): which "must" wishes could become "if possible", and how many
// timetables each choice gives. Plain code, no LLM; the generator (2.4) has already found the
// wishes to blame. Relaxing never deletes a wish: it becomes a "prefer", so ranking still favours
// timetables that keep it (decided 2026-10-23). An "avoid this professor" wish has no "prefer"
// form, so relaxing it removes it.
import type { Constraints } from '../constraints';
import type { Course } from '../data/loadCourses';
import { generate, type GenerateResult, type MustWish } from './generate';

// A wish that can be relaxed: a must wish, or "same building" (judged by the ranker, 2.5).
export type RelaxableWish = MustWish | { kind: 'sameBuilding' };

export type RelaxOption = {
  relax: RelaxableWish[];
  timetables: number | 'many'; // after relaxing; 0 = still nothing fits on its own
};

// The same constraints with these wishes turned into "if possible".
export function relaxWishes(c: Constraints, wishes: RelaxableWish[]): Constraints {
  let out: Constraints = { ...c, courses: c.courses.map(x => ({ ...x })) };
  for (const w of wishes) {
    switch (w.kind) {
      case 'freeDay':
        out.freeDays = out.freeDays.map(f => (f.day === w.day ? { ...f, strength: 'prefer' } : f));
        break;
      case 'noClassesBefore':
      case 'noClassesAfter':
      case 'shift':
      case 'sameBuilding': {
        const current = out[w.kind];
        if (current) out = { ...out, [w.kind]: { ...current, strength: 'prefer' } };
        break;
      }
      case 'professor':
        out.courses = out.courses.map(x =>
          x.query !== w.course || !x.professor
            ? x
            : w.wish === 'avoid'
              ? { ...x, professor: undefined }
              : { ...x, professor: { ...x.professor, wish: 'prefer' } }
        );
        break;
      case 'slot':
        out.courses = out.courses.map(x =>
          x.query === w.course && x.slot ? { ...x, slot: { ...x.slot, strength: 'prefer' } } : x
        );
        break;
    }
  }
  return out;
}

type CourseRequest = { query: string; course: Course };

const count = (r: GenerateResult): RelaxOption['timetables'] =>
  r.status === 'ok' ? r.timetables.length : r.status === 'tooMany' ? 'many' : 0;

// The choices to offer, given why nothing fits.
export function relaxOptions({
  generated,
  rankIssue,
  courses,
  constraints,
}: {
  generated?: GenerateResult;
  rankIssue?: string;
  courses: CourseRequest[];
  constraints: Constraints;
}): RelaxOption[] {
  // Timetables exist, but none keeps every class in one building.
  if (generated?.status === 'ok' && rankIssue === 'same building') {
    return [{ relax: [{ kind: 'sameBuilding' }], timetables: generated.timetables.length }];
  }
  // They clash together: the generator already tried dropping each wish (then pairs) and counted.
  if (generated?.status === 'noTimetable') {
    return generated.fixes.map(f => ({ relax: f.drop, timetables: f.timetables }));
  }
  // One course has no section left: try relaxing each wish to blame, and count what appears.
  if (generated?.status === 'courseImpossible') {
    return generated.conflict.map(w => ({
      relax: [w],
      timetables: count(generate({ courses, constraints: relaxWishes(constraints, [w]) })),
    }));
  }
  return []; // nothing a wish can fix (e.g. the courses clash on their own, or too many)
}
