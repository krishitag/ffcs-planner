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
    courseChoices: {},
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

  it('keeps courses that are not offered aside, for present to explain', () => {
    const { resolved, unresolved } = run('SCOPE', ['OS', 'quantum cooking']);
    expect(resolved).toHaveLength(1);
    expect(unresolved!.map(u => [u.query, u.result.status])).toEqual([
      ['quantum cooking', 'notOfferedInSchool'],
    ]);
  });

  it('uses the branch to pick the right group (Q11)', () => {
    const { resolved } = run('SCOPE', ['ML'], 'BAI');
    expect(resolved![0].ref.domain).toBe('Specialization Elective - BAI');
    // BCE has no Specialization group for ML, so it gets the one general group.
    expect(run('SCOPE', ['ML'], 'BCE').resolved![0].ref.domain).toBe('DisciplineElective');
  });

  it('uses a branch the student mentioned in their message, and saves it', () => {
    const out = resolveCourses({
      messages: [],
      school: 'SCOPE',
      constraints: Constraints.parse({ courses: [{ query: 'ML' }], student: { branch: 'bds' } }),
      courseChoices: {},
    } as unknown as AgentStateType);
    expect(out.resolved![0].ref.domain).toBe('Specialization Elective - BDS');
    expect(out.branch).toBe('BDS');
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
