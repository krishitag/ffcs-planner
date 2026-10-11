// Run with:  npx tsx src/agent/data/toFullCourseData.check.ts
import { getVisibleSubjects } from '@/lib/courseData';
import { loadCourses } from './loadCourses';
import { toFullCourseData } from './toFullCourseData';

const courses = loadCourses();
const find = (school: string, code: string) =>
  courses.find(c => c.school === school && c.code === code)!;

// How many options generateTT will see: one per professor per slot, and for theory + lab
// courses one per professor per lab slot.
const countOptions = (slots: { slotFaculties: { facultyLabSlot?: string }[] }[]) =>
  slots.reduce(
    (n, s) =>
      n +
      s.slotFaculties.reduce(
        (m, f) => m + (f.facultyLabSlot ? f.facultyLabSlot.split(', ').length : 1),
        0
      ),
    0
  );

for (const [school, code] of [
  ['SCOPE', 'BCSE204L'], // theory + lab
  ['SCOPE', 'BCSE203E'], // embedded
  ['SCOPE', 'BCSE304L'], // theory only
  ['SCOPE', 'BENG102P'], // lab only
  ['SCOPE', 'BSTS301P'], // soft skills
  ['SENSE', 'BPHY101L'], // has a Q1 case
] as const) {
  const { course, unavailable } = toFullCourseData(find(school, code));
  if (!course) continue;
  console.log(
    `${school} ${code} | type: ${course.courseType} | slots: ${course.courseSlots.length} | options: ${countOptions(course.courseSlots)} | unavailable: ${unavailable.length}`
  );
  for (const u of unavailable) console.log(`   - ${u.slot} ${u.faculty}: ${u.reason}`);
}

// The website pick from the Phase 0 snapshot must be one of our options.
const daa = toFullCourseData(find('SCOPE', 'BCSE204L')).course;
const f1 = daa?.courseSlots.find(s => s.slotName === 'F1+TF1');
console.log(
  '\nBCSE204L F1+TF1 contains the website pick:',
  f1?.slotFaculties.some(f => f.facultyName === 'SRIVANI A' && f.facultyLabSlot === 'L55+L56'),
  f1?.slotFaculties.some(f => f.facultyName === 'ATHIRA K' && f.facultyLabSlot === 'L37+L38')
);

// Every course the picker lists, in every school: must not crash.
let built = 0;
let unavailableTotal = 0;
const noOptions: string[] = [];
const byDomain = new Map<string, string[]>();
for (const c of courses) {
  const k = `${c.school}|${c.domain}`;
  byDomain.set(k, [...(byDomain.get(k) ?? []), c.key]);
}
for (const c of courses) {
  if (!getVisibleSubjects(byDomain.get(`${c.school}|${c.domain}`)!).includes(c.key)) continue;
  const result = toFullCourseData(c);
  unavailableTotal += result.unavailable.length;
  if (result.noOptionsReason) noOptions.push(`${c.school} / ${c.key}`);
  built++;
}
console.log(
  `\nBuilt ${built} listed courses without errors; ${unavailableTotal} "lab slot unavailable" options removed.`
);
console.log(`${noOptions.length} listed courses have nothing to pick (Q10):`);
for (const n of noOptions) console.log(`   - ${n}`);
