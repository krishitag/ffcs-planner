// Reports anything in the course data the agent doesn't know how to read, so we can ask
// about it (D6). It never rejects, changes or "fixes" data: the data is correct by default.
//
// Run with:  npx tsx src/agent/data/validate.ts
import { getSlot } from '@/lib/slots';
import { getVisibleSubjects, schools } from '@/lib/courseData';
import { loadCourses, type Course } from './loadCourses';
import { toFullCourseData } from './toFullCourseData';
import { DATA_VERSION } from './dataVersion';
import { gitDataDate } from './updateDataVersion';
import { COURSE_ALIASES } from './aliases';

export type Issue = {
  check:
    | 'slot'
    | 'empty course'
    | 'duplicate code'
    | 'nothing to pick'
    | 'empty school'
    | 'data version'
    | 'alias';
  where: string;
  detail: string;
};

export function validateData(courses: Course[] = loadCourses()): Issue[] {
  return [
    ...checkSlots(courses),
    ...checkEmptyCourses(courses),
    ...checkDuplicateCodes(courses),
    ...checkNothingToPick(courses),
    ...checkEmptySchools(courses),
    ...checkDataVersion(),
    ...checkAliases(courses),
  ];
}

// 1. Every slot string must be one the agent can read:
//    - "NIL" (no scheduled classes, R6)
//    - theory parts that each have a cell on the grid ("A1+TA1+TAA1", R3)
//    - lab parts in consecutive odd+even pairs ("L1+L2", "L9+L10+L25+L26", Q4/Q5)
export function slotProblem(slotString: string): string | null {
  if (slotString === 'NIL') return null;
  const parts = slotString.split('+');
  const labParts = parts.filter(p => /^L\d+$/.test(p));

  if (labParts.length === 0) {
    const unknown = parts.filter(p => getSlot(p).length === 0);
    return unknown.length > 0 ? `unknown theory slot(s): ${unknown.join(', ')}` : null;
  }
  if (labParts.length !== parts.length) return 'mixes lab and non-lab parts';

  const numbers = labParts.map(p => Number(p.slice(1)));
  for (let i = 0; i < numbers.length; i += 2) {
    const odd = numbers[i];
    const even = numbers[i + 1];
    if (odd % 2 !== 1 || even !== odd + 1) {
      return 'lab slots must come in consecutive odd+even pairs (L1+L2, L3+L4, ...)';
    }
    if (odd > 59) return `lab slot L${odd} is outside L1-L60`;
  }
  return null;
}

function checkSlots(courses: Course[]): Issue[] {
  const issues: Issue[] = [];
  for (const c of courses) {
    for (const slotString of new Set(c.entries.map(e => e.slot))) {
      const problem = slotProblem(slotString);
      if (problem) {
        issues.push({
          check: 'slot',
          where: `${c.school} / ${c.key}`,
          detail: `"${slotString}": ${problem}`,
        });
      }
    }
  }
  return issues;
}

// 2. A course with no entries can never be picked.
function checkEmptyCourses(courses: Course[]): Issue[] {
  return courses
    .filter(c => c.entries.length === 0)
    .map(c => ({
      check: 'empty course' as const,
      where: `${c.school} / ${c.domain}`,
      detail: `${c.key} has no slot entries`,
    }));
}

// 3. The same code twice in one school + domain, or the same code with different names
//    anywhere. (The same code in several schools is expected: each school has its own list.)
function checkDuplicateCodes(courses: Course[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, string>(); // "school|domain|code" -> key
  const names = new Map<string, Set<string>>(); // code -> names

  for (const c of courses) {
    const place = `${c.school}|${c.domain}|${c.code}`;
    const earlier = seen.get(place);
    if (earlier) {
      issues.push({
        check: 'duplicate code',
        where: `${c.school} / ${c.domain}`,
        detail: `${c.code} appears twice: "${earlier}" and "${c.key}"`,
      });
    }
    seen.set(place, c.key);
    names.set(c.code, (names.get(c.code) ?? new Set()).add(c.name));
  }

  for (const [code, set] of names) {
    if (set.size > 1) {
      issues.push({
        check: 'duplicate code',
        where: code,
        detail: `same code, different names: ${[...set].map(n => `"${n}"`).join(', ')}`,
      });
    }
  }
  return issues;
}

// 4. Courses the picker lists but offers nothing to pick (Q10).
function checkNothingToPick(courses: Course[]): Issue[] {
  const keysByDomain = new Map<string, string[]>();
  for (const c of courses) {
    const k = `${c.school}|${c.domain}`;
    keysByDomain.set(k, [...(keysByDomain.get(k) ?? []), c.key]);
  }
  return courses
    .filter(c => getVisibleSubjects(keysByDomain.get(`${c.school}|${c.domain}`)!).includes(c.key))
    .filter(c => c.entries.length > 0 && toFullCourseData(c).noOptionsReason)
    .map(c => ({
      check: 'nothing to pick' as const,
      where: `${c.school} / ${c.key}`,
      detail: 'the website offers no slot to pick for this course (Q10)',
    }));
}

// 5. Schools with a button but no courses: hidden from the agent's school question (Q6).
function checkEmptySchools(courses: Course[]): Issue[] {
  const withCourses = new Set(courses.map(c => c.school));
  return schools
    .filter(s => !withCourses.has(s))
    .map(s => ({
      check: 'empty school' as const,
      where: s,
      detail: 'has a website button but no courses; hidden from the agent (Q6)',
    }));
}

// 6. DATA_VERSION must match the date src/data last changed in Git. If Git isn't available
//    (e.g. on Vercel), skip quietly: a validator must never crash.
function checkDataVersion(): Issue[] {
  let gitDate: string;
  try {
    gitDate = gitDataDate();
  } catch {
    return [];
  }
  if (gitDate === DATA_VERSION) return [];
  return [
    {
      check: 'data version',
      where: 'src/agent/data/dataVersion.ts',
      detail: `says ${DATA_VERSION} but src/data last changed on ${gitDate}; run: npx tsx src/agent/data/updateDataVersion.ts`,
    },
  ];
}

// 7. Every nickname in aliases.ts must point to a course name that exists in the data (D9).
function checkAliases(courses: Course[]): Issue[] {
  const names = new Set(courses.map(c => c.name.toLowerCase()));
  return Object.entries(COURSE_ALIASES)
    .filter(([, name]) => !names.has(name.toLowerCase()))
    .map(([nickname, name]) => ({
      check: 'alias' as const,
      where: 'src/agent/data/aliases.ts',
      detail: `"${nickname}" points to "${name}", which is not in the data`,
    }));
}

// When run as a script: print a short report grouped by check. Never throws on data issues.
if (require.main === module) {
  const issues = validateData();
  if (issues.length === 0) {
    console.log('No data issues found.');
  } else {
    const byCheck = new Map<string, Issue[]>();
    for (const i of issues) byCheck.set(i.check, [...(byCheck.get(i.check) ?? []), i]);
    for (const [check, list] of byCheck) {
      console.log(`\n${check} (${list.length})`);
      for (const i of list) console.log(`  - ${i.where}: ${i.detail}`);
    }
    console.log(`\n${issues.length} item(s) to look at. Nothing was changed.`);
  }
}
