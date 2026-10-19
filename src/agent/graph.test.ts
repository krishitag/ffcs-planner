import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { buildGraph } from './graph';

// Fake LLMs: one "fills the form" with a fixed answer, the other echoes a fixed reply.
const fakeParser = (form: object) =>
  ({ withStructuredOutput: () => ({ invoke: async () => form }) }) as unknown as BaseChatModel;
const fakeWriter = {
  invoke: async () => ({ content: 'Here you go.' }),
} as unknown as BaseChatModel;

const run = (form: object, school = 'SCOPE') =>
  buildGraph({ parse: fakeParser(form), present: fakeWriter }).invoke({
    messages: [new HumanMessage('(student message)')],
    school,
  });

describe('the whole graph (with fake LLMs)', () => {
  it('goes from a message to 3 checked timetables and an answer', async () => {
    const out = await run({ courses: [{ query: 'OS' }, { query: 'CN' }] });
    expect(out.resolved.map(r => r.query)).toEqual(['OS', 'CN']);
    expect(out.generated?.status).toBe('ok');
    expect(out.ranked).toHaveLength(3);
    expect(out.messages.at(-1)?.content).toBe('Here you go.');
  });

  it('skips generating when no course was found, but still answers', async () => {
    const out = await run({ courses: [{ query: 'quantum cooking' }] });
    expect(out.resolved).toEqual([]);
    expect(out.generated).toBeUndefined();
    expect(out.unresolved[0].result.status).toBe('notOfferedInSchool');
    expect(out.messages.at(-1)?.content).toBe('Here you go.');
  });

  it('keeps the whole conversation (messages are appended)', async () => {
    const out = await run({ courses: [{ query: 'OS' }] });
    expect(out.messages.map(m => m.getType())).toEqual(['human', 'ai']);
  });
});
