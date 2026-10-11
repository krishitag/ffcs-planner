// Flattens the nested course data (school -> domain -> "CODE - Name" -> entries)
// into one list, read fresh from src/data so CodeChef's updates show up automatically.
import { data } from '@/data/faculty';
import { getCourseType, type SubjectEntry } from '@/lib/courseData';

export type Course = {
  school: string;
  domain: string;
  key: string; // exactly as in the data, e.g. "BSTS301P - Advanced Competitive Coding - I"
  code: string; // before the first " - "
  name: string; // after the first " - " (Q9: keeps "- I")
  type: 'L' | 'P' | 'E' | undefined; // L = theory, P = lab, E = embedded (from getCourseType)
  entries: SubjectEntry[];
};

export function loadCourses(): Course[] {
  const courses: Course[] = [];

  for (const [school, domains] of Object.entries(data)) {
    for (const [domain, subjects] of Object.entries(domains)) {
      for (const [key, entries] of Object.entries(subjects)) {
        // Split only at the FIRST " - " (Q9), so "... Coding - I" keeps its "- I".
        const dash = key.indexOf(' - ');
        const code = key.slice(0, dash);
        const name = key.slice(dash + 3);

        courses.push({
          school,
          domain,
          key,
          code,
          name,
          type: getCourseType(code),
          entries,
        });
      }
    }
  }

  return courses;
}
