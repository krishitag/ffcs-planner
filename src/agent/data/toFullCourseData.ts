// Builds EVERY option for one course (every slot, every professor, each professor's lab),
// by "picking everything" with the website's own functions, so the agent can never build
// an option the website wouldn't.
import { data } from '@/data/faculty';
import {
  buildCourseData,
  getTheorySlots,
  getFacultiesForSlot,
  getLabShiftSlots,
  getFacultiesForLabSlots,
} from '@/lib/courseData';
import type { fullCourseData } from '@/lib/type';
import type { Course } from './loadCourses';

// A professor we left out because they have no real lab slot (Q1).
export type UnavailableOption = {
  slot: string;
  faculty: string;
  reason: 'lab slot unavailable for this professor';
};

export type CourseOptions = {
  course: fullCourseData | null; // every option, ready for generateTT (null: nothing to pick)
  unavailable: UnavailableOption[];
  // Set when the website's picker offers no slot at all for this course (open question Q10).
  noOptionsReason?: 'the website offers no slot to pick for this course';
};

// Call this for courses the picker lists (getVisibleSubjects). A lab course whose theory
// course exists is covered by that theory course instead.
export function toFullCourseData(course: Course): CourseOptions {
  const picks: fullCourseData[] = [];
  const base = {
    data,
    school: course.school,
    domain: course.domain,
    subject: course.key,
  };

  if (course.type === 'P' && !course.code.startsWith('BSTS')) {
    // Lab-only course: one pick per shift that has lab slots.
    const shifts = getLabShiftSlots(course.entries);
    for (const shift of ['morning', 'evening'] as const) {
      if (shifts[shift].length === 0) continue;
      const faculties = getFacultiesForLabSlots(course.entries, shifts[shift]);
      picks.push(buildCourseData({ ...base, slot: '', labShift: shift, faculties }));
    }
  } else {
    // Theory, theory + lab, embedded or soft-skills course: one pick per theory slot.
    for (const slot of getTheorySlots(course.entries)) {
      const faculties = getFacultiesForSlot(course.code, course.entries, slot);
      picks.push(buildCourseData({ ...base, slot, labShift: '', faculties }));
    }
  }

  // Nothing to pick (e.g. the type is unknown and every slot is a lab slot): copy the
  // website, which shows an empty slot list, instead of inventing options (Q10).
  if (picks.length === 0) {
    return {
      course: null,
      unavailable: [],
      noOptionsReason: 'the website offers no slot to pick for this course',
    };
  }

  return removeMissingLabs(mergePicks(picks));
}

// Combine several picks of the same course, the way the website does when you add the
// same course again (landing.tsx facultySelectorOnConfirm): a slot picked again replaces
// that slot's professors; other slots are kept.
function mergePicks(picks: fullCourseData[]): fullCourseData {
  const [first, ...rest] = picks; // toFullCourseData only calls this with at least one pick
  let courseSlots = first.courseSlots;
  for (const pick of rest) {
    const kept = courseSlots.filter(
      old => !pick.courseSlots.some(slot => slot.slotName === old.slotName)
    );
    courseSlots = [...kept, ...pick.courseSlots];
  }
  return { ...first, courseSlots };
}

// Q1: when a professor has no lab on the opposite shift, buildCourseData puts the course
// code where the lab slot should be. Don't offer that option; record why instead.
function removeMissingLabs(course: fullCourseData): CourseOptions {
  const unavailable: UnavailableOption[] = [];

  const courseSlots = course.courseSlots
    .map(slot => {
      const slotFaculties = slot.slotFaculties.filter(f => {
        const fakeLab = f.facultyLabSlot === course.courseCode;
        if (fakeLab) {
          unavailable.push({
            slot: slot.slotName,
            faculty: f.facultyName,
            reason: 'lab slot unavailable for this professor',
          });
        }
        return !fakeLab;
      });
      return { ...slot, slotFaculties };
    })
    .filter(slot => slot.slotFaculties.length > 0);

  return { course: { ...course, courseSlots }, unavailable };
}
