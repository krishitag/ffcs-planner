import { describe, it, expect } from 'vitest';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Constraints } from '../constraints';
import { buildPrompt, extractConstraints, latestStudentText, parseRequest } from './parseRequest';

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
  it('writes constraints and who the student is, without overwriting what we already knew', async () => {
    const { model } = fakeModel([
      { courses: [{ query: 'ML' }], student: { school: 'SCOPE', batch: 2024, branch: 'BAI' } },
    ]);
    const update = await parseRequest(
      { messages: [new HumanMessage('ML pls')], school: 'SCORE' } as never,
      model
    );
    expect(update.constraints?.courses[0].query).toBe('ML');
    expect(update.school).toBe('SCORE'); // already known: kept
    expect(update.branch).toBe('BAI'); // newly said: filled in
  });
});
