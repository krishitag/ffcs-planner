import { describe, it, expect } from 'vitest';
import { Constraints } from '../constraints';
import type { AgentStateType } from '../state';
import { resolveCourses } from './resolveCourses';
import { generateNode } from './generate';
import { filterAndRank } from './filterAndRank';

// Run the three code-only steps one after another, like the graph will.
function pipeline(queries: string[], wishes: object = {}) {
  let state = {
    messages: [],
    school: 'SCOPE',
    constraints: Constraints.parse({ courses: queries.map(query => ({ query })), ...wishes }),
    resolved: [],
    unresolved: [],
    ranked: [],
    relaxRounds: 0,
  } as unknown as AgentStateType;
  state = { ...state, ...resolveCourses(state) };
  state = { ...state, ...generateNode(state) };
  state = { ...state, ...filterAndRank(state) };
  return state;
}

describe('generate + filterAndRank nodes', () => {
  it('turns "OS and CN, Brisilla if possible" into 3 checked, explained timetables', () => {
    const s = pipeline(['OS', 'CN'], {
      courses: [{ query: 'OS' }, { query: 'CN', professor: { name: 'Brisilla', wish: 'prefer' } }],
    });
    expect(s.generated?.status).toBe('ok');
    expect(s.ranked).toHaveLength(3);
    expect(s.ranked[0].reasons).toContainEqual({ points: 2, text: 'Brisilla for CN' });
    expect(s.rankIssue).toBeUndefined();
  });

  it('passes on why nothing fits (CN can never have Friday free)', () => {
    const s = pipeline(['OS', 'CN'], { freeDays: [{ day: 'Fri' }] });
    expect(s.generated).toMatchObject({ status: 'courseImpossible', course: 'CN' });
    expect(s.ranked).toEqual([]);
  });

  it('says why ranking is empty when same building is impossible (OS is PRP, CN is SJT)', () => {
    const s = pipeline(['OS', 'CN'], { sameBuilding: {} });
    expect(s.generated?.status).toBe('ok');
    expect(s.ranked).toEqual([]);
    expect(s.rankIssue).toBe('same building');
  });

  it('generates nothing when no course was found', () => {
    const s = pipeline(['quantum cooking']);
    expect(s.generated).toBeUndefined();
    expect(s.ranked).toEqual([]);
  });
});
