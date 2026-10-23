import { describe, it, expect } from 'vitest';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Constraints } from '../constraints';
import {
  buildPrompt,
  COULD_NOT_PARSE_REPLY,
  extractConstraints,
  latestStudentText,
  LLM_BUSY_REPLY,
  parseRequest,
} from './parseRequest';

// A fake model that returns the given answers in order and remembers the prompts it got,
// so we can test our code around the LLM without calling Gemini.
function fakeModel(answers: object[]) {
  const prompts: string[] = [];
  const model = {
    withStructuredOutput: () => ({
      invoke: async (prompt: string) => {
        prompts.push(prompt);
        return answers[Math.min(prompts.length - 1, answers.length - 1)];
      },
    }),
  } as unknown as BaseChatModel;
  return { model, prompts };
}

describe('extractConstraints', () => {
  it('returns a valid form and fills in the defaults', async () => {
    const { model } = fakeModel([{ courses: [{ query: 'OS' }], freeDays: [{ day: 'Fri' }] }]);
    const c = await extractConstraints('OS, keep Friday free', undefined, model);
    expect(c.freeDays).toEqual([{ day: 'Fri', strength: 'must' }]);
  });

  it('retries with the error when the answer is invalid', async () => {
    const { model, prompts } = fakeModel([
      { freeDays: [{ day: 'Saturday' }] }, // invalid day
      { freeDays: [{ day: 'Fri' }] },
    ]);
    const c = await extractConstraints('friday free', undefined, model);
    expect(c.freeDays[0].day).toBe('Fri');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/previous answer was invalid/);
  });

  it('gives up with a clear error after 3 invalid answers', async () => {
    const { model, prompts } = fakeModel([{ noClassesBefore: { time: '8am' } }]);
    await expect(extractConstraints('no 8am', undefined, model)).rejects.toThrow(/after 3 tries/);
    expect(prompts).toHaveLength(3);
  });
});

describe('buildPrompt and latestStudentText', () => {
  it('includes the previous form for follow-up messages', () => {
    const previous = Constraints.parse({ courses: [{ query: 'OS' }] });
    expect(buildPrompt('also add CN', previous)).toMatch(/Previous form:[\s\S]*"OS"/);
  });

  it('reads the latest message from the student, not the agent', () => {
    const messages = [
      new HumanMessage('OS and CN'),
      new AIMessage('Which school?'),
      new HumanMessage('SCOPE'),
    ];
    expect(latestStudentText(messages)).toBe('SCOPE');
  });
});

describe('parseRequest node', () => {
  it('writes constraints and the branch; school and batch are left to askSchool', async () => {
    const { model } = fakeModel([
      { courses: [{ query: 'ML' }], student: { school: 'SCOPE', batch: 2024, branch: 'BAI' } },
    ]);
    const update = await parseRequest(
      { messages: [new HumanMessage('ML pls')], school: 'SCORE' } as never,
      model
    );
    expect(update.constraints?.courses[0].query).toBe('ML');
    expect(update.constraints?.student).toEqual({ school: 'SCOPE', batch: 2024, branch: 'BAI' });
    expect(update).not.toHaveProperty('school'); // one writer: askSchool
    expect(update).not.toHaveProperty('batch');
    expect(update.branch).toBe('BAI'); // newly said: filled in
  });

  it('replies kindly instead of crashing when the AI is rate-limited, without retrying', async () => {
    let calls = 0;
    const limited = {
      withStructuredOutput: () => ({
        invoke: async () => {
          calls++;
          throw Object.assign(new Error('429'), { status: 429 }); // no retry delay given
        },
      }),
    } as unknown as BaseChatModel;
    const update = await parseRequest({ messages: [new HumanMessage('OS')] } as never, limited);
    expect(update.messages?.[0].content).toBe(LLM_BUSY_REPLY);
    expect(update.constraints).toBeUndefined(); // the earlier wishes stay as they were
    expect(calls).toBe(1);
  });

  it('asks the student to rephrase after 3 invalid answers', async () => {
    const { model } = fakeModel([{ noClassesBefore: { time: '8am' } }]);
    const update = await parseRequest({ messages: [new HumanMessage('no 8am')] } as never, model);
    expect(update.messages?.[0].content).toBe(COULD_NOT_PARSE_REPLY);
  });
});
