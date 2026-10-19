// Graph step 2 (3.5): turn each course the student named ("OS", "DBMS") into the real course,
// with the 2.2 search, only in the student's school. Plain code, no LLM (decision O4 = A):
// predictable, fast and testable. Unclear ones are kept aside so the agent can ask (Phase 4).
import { loadCourses } from '../data/loadCourses';
import { searchCourses } from '../tools/searchCourses';
import { refFor, type AgentStateType, type ResolvedCourse, type UnresolvedCourse } from '../state';

export function resolveCourses(state: AgentStateType): Partial<AgentStateType> {
  const resolved: ResolvedCourse[] = [];
  const unresolved: UnresolvedCourse[] = [];
  const school = state.school ?? '';

  for (const { query } of state.constraints?.courses ?? []) {
    const result = searchCourses({ school, query, branch: state.branch });
    if (result.status !== 'found') {
      unresolved.push({ query, result });
      continue;
    }
    const course = loadCourses().find(
      c => c.school === school && c.domain === result.match.domain && c.key === result.match.key
    );
    if (!course) {
      unresolved.push({ query, result: { status: 'notOfferedInSchool', school, query } });
      continue;
    }
    // The same course named twice ("OS" and "BCSE303L") is one course.
    if (resolved.some(r => r.ref.key === course.key && r.ref.domain === course.domain)) continue;
    resolved.push({ query, ref: refFor(course) });
  }

  return { resolved, unresolved };
}
