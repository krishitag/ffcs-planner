// Graph step 4 (3.6): rank the generated timetables on the prefer wishes (2.5), then let only
// those that pass the independent final check (2.6) through. Thin glue around the tools.
import { filterRank } from '../tools/filterRank';
import { keepVerified } from '../tools/finalCheck';
import { courseFor, type AgentStateType } from '../state';
import { Constraints } from '../constraints';

export function filterAndRank(state: AgentStateType): Partial<AgentStateType> {
  const generated = state.generated;
  if (generated?.status !== 'ok') return { ranked: [], rankIssue: undefined };

  const constraints = state.constraints ?? Constraints.parse({});
  const result = filterRank(generated.timetables, constraints);
  if (result.status === 'noneLeft') return { ranked: [], rankIssue: 'same building' };

  const courses = state.resolved.flatMap(r => {
    const course = courseFor(r.ref);
    return course ? [{ query: r.query, course }] : [];
  });
  const ranked = keepVerified(result.ranked, courses, constraints);
  return {
    ranked,
    rankIssue: ranked.length === 0 ? 'final check rejected all' : undefined,
  };
}
