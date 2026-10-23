// Which course list a student uses (step 4.2): their program + the year they joined → an EXISTING
// top-level key of `data` (Q7). Plain code, no LLM. Never guesses: if no list fits, it says so and
// the agent asks again.
//   SCOPE + 2024 → "SCOPE"              (older batches use the plain list)
//   SCOPE + 2025 → "SCOPE ('25 Batch)"  (the 2025 curriculum)
//   SCHEME + 2025 → no list (only a plain SCHEME list exists), so ask again
import { data } from '@/data/faculty';
import { schools } from '@/lib/courseData';
import { loadCourses } from '../data/loadCourses';
import { listedCourses } from './searchCourses';

const BATCH_25 = " ('25 Batch)";

// Programs as named in the data: "SCOPE", "MTech", "MIS", ... (keys without the batch suffix).
const PROGRAMS = [...new Set(Object.keys(data).map(k => k.replace(BATCH_25, '')))];

// The lists a student can pick: the website's buttons (SCOPE first) minus empty ones (Q6).
// Worked out from the data, so it follows CodeChef's changes.
export function offeredSchools(): string[] {
  const all = loadCourses();
  return schools.filter(s => listedCourses(all.filter(c => c.school === s)).length > 0);
}

// The programs to show in the question, in the website's order (SCOPE first).
export function offeredPrograms(): string[] {
  return [...new Set(offeredSchools().map(s => s.replace(BATCH_25, '')))];
}

// "scope", "SCOPE 2024", "m.tech" → "SCOPE" / "MTech": the one program named in the text, if any.
export function findProgram(text: string): string | undefined {
  const words = new Set(
    text
      .toLowerCase()
      .replace(/\./g, '')
      .split(/[^a-z0-9]+/)
  );
  const found = PROGRAMS.filter(p => words.has(p.toLowerCase()));
  return found.length === 1 ? found[0] : undefined; // none or two: not sure, so ask
}

// "2024", "'25", "25 batch" → 2024 / 2025 / 2025. Only years 2020-2029; two different years: unsure.
export function findBatch(text: string): number | undefined {
  const years = new Set([...text.matchAll(/\b(?:20)?(2\d)\b/g)].map(m => 2000 + Number(m[1])));
  return years.size === 1 ? [...years][0] : undefined;
}

// A batch from the form may be written short (25); make it a full year.
export const fullYear = (batch: number) => (batch < 100 ? 2000 + batch : batch);

export type SchoolResult =
  | { status: 'found'; school: string; batch: number }
  | { status: 'needMore'; missing: ('program' | 'batch')[] } // didn't say it (clearly)
  | { status: 'noList'; program: string; batch: number } // no list for that program + year
  | { status: 'noCourses'; school: string }; // the list exists but is empty (SCE, MIS, ...)

export function findSchool(program?: string, batch?: number): SchoolResult {
  const missing: ('program' | 'batch')[] = [];
  if (!program) missing.push('program');
  if (batch === undefined) missing.push('batch');
  if (!program || batch === undefined) return { status: 'needMore', missing };

  const year = fullYear(batch);
  // ('25 Batch) lists are for students who joined in 2025 (Q7). Nothing is known about later
  // batches yet, so they get "no list" and are asked which list they pick, instead of a guess.
  const key = year === 2025 ? program + BATCH_25 : year < 2025 ? program : undefined;
  if (!key || !(key in data)) return { status: 'noList', program, batch: year };
  if (!offeredSchools().includes(key)) return { status: 'noCourses', school: key };
  return { status: 'found', school: key, batch: year };
}
