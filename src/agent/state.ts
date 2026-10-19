// The agent's shared "notebook" (step 3.3): everything the graph's steps pass to each other.
// Each field is written by exactly ONE node (named below), so a wrong value has one suspect.
// Everything here must be plain data (no functions or classes), because from Phase 4 the whole
// state is saved after every step, which is how the agent remembers between messages.
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { Constraints } from './constraints';
import { loadCourses, type Course } from './data/loadCourses';
import type { SearchResult } from './tools/searchCourses';
import type { GenerateResult } from './tools/generate';
import type { RankedTimetable } from './tools/filterRank';

// A small pointer to one course in the data (not the whole course), to keep saved state small.
export type CourseRef = { school: string; domain: string; key: string };

// A course the student asked for, and the real course it was matched to.
export type ResolvedCourse = { query: string; ref: CourseRef };

// A course mention that couldn't be matched cleanly (ambiguous, not offered, ...).
export type UnresolvedCourse = { query: string; result: SearchResult };

export const AgentState = Annotation.Root({
  // The conversation. Its reducer APPENDS new messages instead of replacing the list
  // (the P.2 lesson: without it, every reply would wipe the history).
  ...MessagesAnnotation.spec,

  // Who the student is. Written by: parseRequest (if they said it) / askSchool (Phase 4).
  school: Annotation<string | undefined>(),
  batch: Annotation<number | undefined>(),
  branch: Annotation<string | undefined>(),

  // What they want: the 2.3 constraints form, filled in by the LLM. Written by: parseRequest.
  constraints: Annotation<Constraints | undefined>(),

  // Courses matched to the data, and the ones that couldn't be. Written by: resolveCourses.
  resolved: Annotation<ResolvedCourse[]>({ reducer: (_, next) => next, default: () => [] }),
  unresolved: Annotation<UnresolvedCourse[]>({ reducer: (_, next) => next, default: () => [] }),

  // The generator's answer: timetables, or why nothing fits. Written by: generate.
  generated: Annotation<GenerateResult | undefined>(),

  // The best 2-3 timetables with reasons, after the final check. Written by: filterAndRank.
  ranked: Annotation<RankedTimetable[]>({ reducer: (_, next) => next, default: () => [] }),

  // Why `ranked` is empty even though timetables were generated, if it is. Written by: filterAndRank.
  rankIssue: Annotation<'same building' | 'final check rejected all' | undefined>(),

  // How many times we've asked the student to drop a wish (Phase 4 loop cap). Written by: relax.
  relaxRounds: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
});

export type AgentStateType = typeof AgentState.State;

// Turn a stored pointer back into the full course from today's data.
export function courseFor(ref: CourseRef): Course | undefined {
  return loadCourses().find(
    c => c.school === ref.school && c.domain === ref.domain && c.key === ref.key
  );
}

export function refFor(course: Course): CourseRef {
  return { school: course.school, domain: course.domain, key: course.key };
}
