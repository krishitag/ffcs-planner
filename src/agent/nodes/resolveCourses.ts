// Graph step 2 (3.5): turn each course the student named ("OS", "DBMS") into the real course,
// with the 2.2 search, only in the student's school. Plain code, no LLM (decision O4 = A):
// predictable, fast and testable.
//
// When a course is unclear it PAUSES the graph with interrupt() and asks (4.3):
//   - the same course is listed in several groups ("ML": DisciplineElective, BAI, BDS) and the
//     branch is unknown → ask the branch ONCE; it settles every such course (Q11);
//   - several different courses match ("cloud", "java") → the top 5 as numbered options, or type
//     a code/name, or "none" to leave it out.
// Answers are saved (`branch`, `courseChoices`), so the same thing is never asked twice in a thread.
// On resume this node re-runs from the top and each interrupt() returns its saved answer in
// order, so everything before an interrupt must be safe to repeat (it is: only reads and search).
import { interrupt } from '@langchain/langgraph';
import { loadCourses } from '../data/loadCourses';
import { searchCourses, type SearchMatch, type SearchResult } from '../tools/searchCourses';
import {
  courseFor,
  refFor,
  type AgentStateType,
  type CourseRef,
  type Question,
  type ResolvedCourse,
  type UnresolvedCourse,
} from '../state';

const MAX_OPTIONS = 5;

// ---- Reading the answers (plain code, as for the school in 4.2) ----------------------------

// "BAI", "i'm bds", "BCE branch" → "BAI" / "BDS" / "BCE": a VIT branch code (B + two letters).
export function findBranch(text: string): string | undefined {
  const codes = new Set(text.toUpperCase().match(/\bB[A-Z]{2}\b/g) ?? []);
  return codes.size === 1 ? [...codes][0] : undefined; // none or two: not sure, so ask
}

// The answer to a numbered question:
//   a number → that option;  "none" → leave the course out;  anything else → search for that text
//   (so the student can type a code or a name, even one that wasn't listed).
export type Pick = { option: SearchMatch } | { leaveOut: true } | { search: string };

export function readPick(answer: string, options: SearchMatch[]): Pick {
  const text = answer.trim();
  if (/^(none|skip|neither|leave it( out)?|none of (these|them))\.?$/i.test(text)) {
    return { leaveOut: true };
  }
  const n = Number(text);
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return { option: options[n - 1] };
  return { search: text };
}

// ---- The questions ---------------------------------------------------------------------------

// The domain's branch code, if it's a "Specialization Elective - BAI" group.
const specBranch = (domain: string) => domain.match(/^Specialization Elective - (\w+)$/)?.[1];

export function branchQuestion(query: string, groups: SearchMatch[], problem?: string): Question {
  const codes = [...new Set(groups.map(g => specBranch(g.domain)).filter(Boolean))];
  const ask =
    `"${query}" (${groups[0].code} ${groups[0].name}) is offered in several groups: ` +
    `${groups.map(g => g.domain).join(', ')}. Which one you can take depends on your branch.\n` +
    `Which branch are you in? Type its code, e.g. ${codes.join(', ')}.`;
  return { question: problem ? `${problem}\n${ask}` : ask };
}

// One option per course (several groups of the same course only when the groups ARE the choice).
export function optionsFor(candidates: SearchMatch[]): SearchMatch[] {
  const sameCourse = candidates.every(c => c.code === candidates[0].code);
  const seen = new Set<string>();
  return candidates
    .filter(c => {
      const id = sameCourse ? c.domain : c.code;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, MAX_OPTIONS);
}

export function courseQuestion(query: string, options: SearchMatch[], problem?: string): Question {
  const sameCourse = options.every(o => o.code === options[0].code);
  const ask =
    `Which ${sameCourse ? 'group' : 'course'} did you mean by "${query}"? ` +
    'Reply with a number, a course code or name, or "none" to leave it out.';
  return {
    question: problem ? `${problem}\n${ask}` : ask,
    options: options.map(o => `${o.code} ${o.name}${sameCourse ? ` (${o.domain})` : ''}`),
  };
}

// ---- The node ------------------------------------------------------------------------------

const choiceKey = (query: string) => query.trim().toLowerCase();

export function resolveCourses(state: AgentStateType): Partial<AgentStateType> {
  const resolved: ResolvedCourse[] = [];
  const unresolved: UnresolvedCourse[] = [];
  const school = state.school ?? '';
  let branch = state.branch ?? state.constraints?.student?.branch?.toUpperCase();
  const choices = { ...state.courseChoices };

  const add = (query: string, ref: CourseRef) => {
    // The same course named twice ("OS" and "BCSE303L") is one course.
    if (resolved.some(r => r.ref.key === ref.key && r.ref.domain === ref.domain)) return;
    resolved.push({ query, ref });
  };

  for (const { query } of state.constraints?.courses ?? []) {
    // Answered before in this thread? Use that, without searching or asking again.
    const key = choiceKey(query);
    if (key in choices) {
      const picked = choices[key];
      const course = picked && courseFor(picked);
      if (course) add(query, refFor(course));
      continue; // null = the student said "none"
    }

    let searchFor = query;
    let asked = false;
    let problem: string | undefined;
    for (;;) {
      const result: SearchResult = searchCourses({ school, query: searchFor, branch });

      if (result.status === 'found') {
        const course = loadCourses().find(
          c => c.school === school && c.domain === result.match.domain && c.key === result.match.key
        );
        if (!course) {
          unresolved.push({ query, result: { status: 'notOfferedInSchool', school, query } });
          break;
        }
        add(query, refFor(course));
        if (asked) choices[key] = refFor(course); // remember the answer
        break;
      }

      if (result.status === 'notOfferedInSchool' && asked) {
        // What they typed in answer isn't found: say so and ask the original question again.
        problem = `I couldn't find "${searchFor}" in ${school}.`;
        searchFor = query;
        continue;
      }
      if (result.status !== 'ambiguous') {
        unresolved.push({ query, result }); // not offered, no school, ...: present explains
        break;
      }

      // Several groups and no branch yet: ask the branch (once), then search again.
      if (result.reason === 'several groups' && !branch) {
        branch = findBranch(String(interrupt(branchQuestion(query, result.candidates, problem))));
        problem = branch ? undefined : 'Sorry, I need your branch code, like BCE or BAI.';
        continue;
      }

      // Several courses (or groups the branch doesn't decide): pick from the options.
      const options = optionsFor(result.candidates);
      const answer = String(interrupt(courseQuestion(searchFor, options, problem)));
      const pick = readPick(answer, options);
      asked = true;
      problem = undefined;
      if ('leaveOut' in pick) {
        choices[key] = null;
        break;
      }
      if ('option' in pick) {
        const course = loadCourses().find(
          c => c.school === school && c.domain === pick.option.domain && c.key === pick.option.key
        );
        if (course) {
          add(query, refFor(course));
          choices[key] = refFor(course);
          break;
        }
      }
      // Typed a code or name instead: search for that (it may be clear now, or ask again).
      searchFor = 'search' in pick ? pick.search : searchFor;
    }
  }

  return { resolved, unresolved, branch, courseChoices: choices };
}
