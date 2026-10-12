// Finds the real course(s) a student means ("OS", "BCSE303", "operating sytems", "DBMS"),
// searching ONLY their own school's list (D7). Says when it isn't sure, so the agent can ask
// instead of guessing, and never looks in another school.
import { data } from '@/data/faculty';
import { getVisibleSubjects, schools } from '@/lib/courseData';
import { COURSE_ALIASES } from '../data/aliases';
import { loadCourses, type Course } from '../data/loadCourses';

export type MatchedBy = 'code' | 'alias' | 'name' | 'initials' | 'words' | 'company';

export type SearchMatch = {
  code: string; // e.g. "BCSE303L"
  name: string; // full name (Q9), e.g. "Operating Systems"
  key: string; // exactly as in the data
  domain: string; // the group it's listed under, e.g. "DisciplineCore" (Q11)
  labCode?: string; // the lab that comes with it, e.g. "BCSE303P"
  score: number; // 0..1, higher is better
  matchedBy: MatchedBy;
};

export type SearchResult =
  | { status: 'found'; match: SearchMatch }
  | { status: 'ambiguous'; reason: 'similar matches' | 'several groups'; candidates: SearchMatch[] }
  | { status: 'notOfferedInSchool'; school: string; query: string }
  | { status: 'noCoursesForSchool'; school: string } // e.g. SCE today (Q6)
  | { status: 'unknownSchool'; school: string };

const MIN_SCORE = 0.6; // below this it isn't a match at all
const CLOSE_CALL = 0.1; // top two within this of each other → ambiguous
const SMALL_WORDS = new Set(['of', 'and', 'the', 'for', 'in', 'to', 'with', 'a', 'an']);

export function searchCourses({
  school,
  query,
  branch,
}: {
  school: string;
  query: string;
  branch?: string; // the student's branch/specialization, e.g. "BCE", "BAI" (Q11)
}): SearchResult {
  // 1. The school must be one we know (Q6). Known but empty → "no courses listed yet".
  if (!(school in data)) return { status: 'unknownSchool', school };
  const schoolCourses = loadCourses().filter(c => c.school === school);
  const courses = listedCourses(schoolCourses);
  if (courses.length === 0) return { status: 'noCoursesForSchool', school };
  if (!schools.includes(school)) return { status: 'unknownSchool', school }; // not offered (Q6)

  // 2. Score every listed course in this school; keep the real matches, best first.
  const q = normalise(query);
  const matches = courses
    .map(c => scoreCourse(c, q, schoolCourses))
    .filter((m): m is SearchMatch => m !== null && m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) return { status: 'notOfferedInSchool', school, query };

  // 3. The same course listed in several groups (Q11): pick the student's group, or ask.
  const top = matches[0];
  const sameCourse = matches.filter(m => m.code === top.code);
  if (sameCourse.length > 1) {
    const chosen = pickGroup(sameCourse, branch);
    if (!chosen) return { status: 'ambiguous', reason: 'several groups', candidates: sameCourse };
    const others = matches.filter(m => m.code !== top.code);
    return decide([chosen, ...others]);
  }
  return decide(matches);
}

// found if the best match is clearly ahead; otherwise ambiguous with the close ones.
function decide(matches: SearchMatch[]): SearchResult {
  const [best, second] = matches;
  if (second && best.score - second.score <= CLOSE_CALL) {
    const close = matches.filter(m => best.score - m.score <= CLOSE_CALL);
    return { status: 'ambiguous', reason: 'similar matches', candidates: close };
  }
  return { status: 'found', match: best };
}

// Q11 rule: a student's own "Specialization Elective - <branch>" group if there is one;
// otherwise, with a known branch, the one group that isn't a specialization group.
// Unknown branch or no single fit → null (the agent shows the groups and asks).
function pickGroup(options: SearchMatch[], branch?: string): SearchMatch | null {
  if (!branch) return null;
  const own = options.find(m => m.domain.endsWith(`- ${branch.toUpperCase()}`));
  if (own) return own;
  const general = options.filter(m => !m.domain.startsWith('Specialization Elective'));
  return general.length === 1 ? general[0] : null;
}

// The courses the website's picker lists for this school (a lab whose theory course
// exists is hidden; it comes with the theory course).
function listedCourses(all: Course[]): Course[] {
  const keysByDomain = new Map<string, string[]>();
  for (const c of all) keysByDomain.set(c.domain, [...(keysByDomain.get(c.domain) ?? []), c.key]);
  const visible = new Set([...keysByDomain.values()].flatMap(keys => getVisibleSubjects(keys)));
  return all.filter(c => visible.has(c.key));
}

// Try every way of matching and keep the best one.
function scoreCourse(c: Course, q: string, all: Course[]): SearchMatch | null {
  if (!q) return null;
  const qCode = q.replace(/\s+/g, '').toUpperCase();
  const name = normalise(c.name);
  const tries: [number, MatchedBy][] = [];

  // Code: exact, or a prefix of at least 6 characters ("BCSE303" → "BCSE303L").
  if (qCode === c.code) tries.push([1, 'code']);
  else if (qCode.length >= 6 && c.code.startsWith(qCode)) tries.push([0.97, 'code']);

  // Nickname list (D9).
  const alias = COURSE_ALIASES[qCode];
  if (alias && normalise(alias) === name) tries.push([0.95, 'alias']);

  // The full name typed out.
  if (q === name) tries.push([0.98, 'name']);

  // Initials, with and without small words: "OS", "TOC", "DAA", "DSA".
  if (/^[A-Z]{2,6}$/.test(qCode) && initials(name).includes(qCode)) tries.push([0.9, 'initials']);

  // Words of the name, allowing small typos ("operating sytems").
  const words = wordScore(q, name);
  if (words > 0) tries.push([words, 'words']);

  // Soft skills: a company name ("FACE") matches every section of that company (Q8).
  if (c.code.startsWith('BSTS') && q.length >= 3) {
    if (c.entries.some(e => normalise(e.faculty).split(' ').includes(q)))
      tries.push([0.8, 'company']);
  }

  if (tries.length === 0) return null;
  const [score, matchedBy] = tries.sort((a, b) => b[0] - a[0])[0];
  return {
    code: c.code,
    name: c.name,
    key: c.key,
    domain: c.domain,
    labCode: labFor(c, all),
    score,
    matchedBy,
  };
}

// How well the query's words cover the name's words: 0 if any query word is missing.
// An exact word counts 1, a word with a small typo 0.8.
function wordScore(q: string, name: string): number {
  const qWords = q.split(' ').filter(w => w.length >= 2 && !SMALL_WORDS.has(w));
  const nameWords = name.split(' ').filter(w => !SMALL_WORDS.has(w));
  if (qWords.length === 0) return 0;

  let found = 0;
  let used = 0;
  for (const w of qWords) {
    if (nameWords.includes(w)) {
      found += 1;
      used++;
    } else if (nameWords.some(n => closeEnough(w, n))) {
      found += 0.8;
      used++;
    } else {
      return 0; // every word the student typed must be in the name
    }
  }
  const coverage = used / nameWords.length; // prefer "Operating Systems" over a longer name
  return 0.85 * (found / qWords.length) * (0.8 + 0.2 * coverage);
}

// A typo is fine if the word is long enough: 1 letter off from 4 letters, 2 off from 7.
function closeEnough(typed: string, real: string): boolean {
  if (typed.length < 4) return false;
  const allowed = typed.length >= 7 ? 2 : 1;
  return editDistance(typed, real) <= allowed;
}

// The fewest single-letter changes to turn a into b: insert, delete, replace, or swap two
// neighbouring letters ("desgin" -> "design" is 1 change, a very common typo).
export function editDistance(a: string, b: string): number {
  // d[i][j] = changes to turn the first i letters of a into the first j letters of b
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // delete a letter
        d[i][j - 1] + 1, // insert a letter
        d[i - 1][j - 1] + cost // replace (or keep) a letter
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // swap two neighbours
      }
    }
  }
  return d[a.length][b.length];
}

// Initials of all words, and of the words without "of/and/the...": both are accepted.
function initials(name: string): string[] {
  const words = name.split(' ').filter(Boolean);
  const all = words
    .map(w => w[0])
    .join('')
    .toUpperCase();
  const big = words
    .filter(w => !SMALL_WORDS.has(w))
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return [all, big];
}

// The lab course that comes with a theory course (same code ending in P or E, same group).
// `all` is every course in the school, including the labs the picker hides.
function labFor(c: Course, all: Course[]): string | undefined {
  if (c.type !== 'L') return undefined;
  const base = c.code.slice(0, -1);
  return all.find(o => o.domain === c.domain && o.code !== c.code && o.code.slice(0, -1) === base)
    ?.code;
}

// Lower case, letters/digits/spaces only, single spaces: "Operating  Sytems!" → "operating sytems".
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
