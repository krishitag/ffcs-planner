// Graph step 3 (3.6): run the 2.4 generator on the resolved courses and the student's must
// wishes. Thin glue: all the logic lives in tools/generate.ts (tested there).
import { generate } from '../tools/generate';
import { courseFor, type AgentStateType } from '../state';
import { Constraints } from '../constraints';

export function generateNode(state: AgentStateType): Partial<AgentStateType> {
  const courses = state.resolved.flatMap(r => {
    const course = courseFor(r.ref);
    return course ? [{ query: r.query, course }] : [];
  });
  if (courses.length === 0) return { generated: undefined }; // nothing to generate yet

  return {
    generated: generate({ courses, constraints: state.constraints ?? Constraints.parse({}) }),
  };
}
