import { describe, it, expect } from 'vitest';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Constraints } from '../constraints';
import type { AgentStateType } from '../state';
import { resolveCourses } from './resolveCourses';
import { generateNode } from './generate';
import { filterAndRank } from './filterAndRank';
import { buildFacts, groundingProblems, fallbackText, writeAnswer, present } from './present';

function pipeline(queries: string[], wishes: object = {}) {
  let s = {
    messages: [],
    school: 'SCOPE',
    constraints: Constraints.parse({ courses: queries.map(query => ({ query })), ...wishes }),
    resolved: [],
    unresolved: [],
    ranked: [],
    relaxRounds: 0,
  } as unknown as AgentStateType;
  s = { ...s, ...resolveCourses(s) };
  s = { ...s, ...generateNode(s) };
  return { ...s, ...filterAndRank(s) } as AgentStateType;
}

// A fake LLM that replies with the given texts in order.
const fakeModel = (replies: string[]) => {
  let i = 0;
  return {
    invoke: async () => ({ content: replies[Math.min(i++, replies.length - 1)] }),
  } as unknown as BaseChatModel;
};

describe('buildFacts', () => {
  it('describes the checked timetables with real times, full names and reasons', () => {
    const facts = buildFacts(pipeline(['OS', 'CN']));
    expect(facts.timetables).toHaveLength(3);
    const os = facts.timetables[0].courses.find(c => c.query === 'OS')!;
    expect(os.name).toBe('Operating Systems');
    expect(os.times.length).toBeGreaterThanOrEqual(3);
    expect(os.times[0]).toMatch(/^(Mon|Tue|Wed|Thu|Fri) \d\d:\d\d-\d\d:\d\d \(/);
  });

  it('explains why nothing fits, with the way out', () => {
    const facts = buildFacts(pipeline(['OS', 'CN'], { freeDays: [{ day: 'Fri' }] }));
    expect(facts.timetables).toEqual([]);
    expect(facts.noTimetable?.why).toBe('no section of CN fits Fri free');
    expect(facts.noTimetable?.ways_out).toEqual(['drop "Fri free"']);
  });

  it('lists courses it could not match, with the options to choose from', () => {
    const facts = buildFacts(pipeline(['OS', 'ML']));
    const ml = facts.notFound.find(n => n.query === 'ML')!;
    expect(ml.why).toMatch(/several groups/);
    expect(ml.options).toHaveLength(3);
  });
});

describe('grounding: the answer may only mention what is in the facts', () => {
  const facts = buildFacts(pipeline(['OS', 'CN']));
  const realSlot = facts.timetables[0].courses[0].slot.split('+')[0];

  it('accepts slots and codes from the facts', () => {
    expect(groundingProblems(`OS (BCSE303L) in ${realSlot}`, facts)).toEqual([]);
  });

  it('flags an invented slot or course code', () => {
    expect(groundingProblems('Take OS in A1 or BCSE999L', facts)).toEqual([
      'slot A1 is not in the facts',
      'course BCSE999L is not in the facts',
    ]);
  });

  it('retries once, then falls back to the plain answer if the LLM keeps inventing', async () => {
    const text = await writeAnswer(facts, fakeModel(['OS in A1', 'OS in A1 again']));
    expect(text).toBe(fallbackText(facts));
  });

  it('uses the LLM text when it sticks to the facts', async () => {
    const text = await writeAnswer(
      facts,
      fakeModel(['Option 1 looks good. Course data from today.'])
    );
    expect(text).toBe('Option 1 looks good. Course data from today.');
  });

  it('falls back when the LLM fails, so the student always gets an answer', async () => {
    const broken = {
      invoke: async () => {
        throw new Error('network');
      },
    } as unknown as BaseChatModel;
    expect(await writeAnswer(facts, broken)).toBe(fallbackText(facts));
  });
});

describe('present node', () => {
  it('adds the answer to the conversation', async () => {
    const update = await present(pipeline(['OS', 'CN']), fakeModel(['Here are your options.']));
    expect(update.messages?.[0].content).toBe('Here are your options.');
  });
});
