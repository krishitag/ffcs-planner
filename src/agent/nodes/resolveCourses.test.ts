import { describe, it, expect } from 'vitest';
import { Constraints } from '../constraints';
import type { AgentStateType } from '../state';
import { resolveCourses } from './resolveCourses';

const run = (school: string | undefined, queries: string[], branch?: string) =>
  resolveCourses({
    messages: [],
    school,
    branch,
    constraints: Constraints.parse({ courses: queries.map(query => ({ query })) }),
  } as unknown as AgentStateType);

describe('resolveCourses', () => {
  it('turns what the student typed into real courses in their school', () => {
    const { resolved, unresolved } = run('SCOPE', ['OS', 'DBMS', 'compiler desgin']);
    expect(resolved!.map(r => r.ref.key.split(' - ')[0])).toEqual([
      'BCSE303L',
      'BCSE302L',
      'BCSE307L',
    ]);
    expect(unresolved).toEqual([]);
  });

  it('keeps unclear courses aside so the agent can ask (Phase 4)', () => {
    const { resolved, unresolved } = run('SCOPE', ['OS', 'ML', 'quantum cooking']);
    expect(resolved).toHaveLength(1);
    expect(unresolved!.map(u => [u.query, u.result.status])).toEqual([
      ['ML', 'ambiguous'], // three Specialization groups, branch unknown (Q11)
      ['quantum cooking', 'notOfferedInSchool'],
    ]);
  });

  it('uses the branch to pick the right group (Q11)', () => {
    const { resolved } = run('SCOPE', ['ML'], 'BAI');
    expect(resolved![0].ref.domain).toBe('Specialization Elective - BAI');
  });

  it('counts the same course named twice only once', () => {
    expect(run('SCOPE', ['OS', 'BCSE303L']).resolved).toHaveLength(1);
  });

  it('without a school, nothing is searched (D7)', () => {
    const { resolved, unresolved } = run(undefined, ['OS']);
    expect(resolved).toEqual([]);
    expect(unresolved![0].result.status).toBe('unknownSchool');
  });
});
