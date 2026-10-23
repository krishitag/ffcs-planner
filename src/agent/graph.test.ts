import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { MemorySaver } from '@langchain/langgraph';
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

  it('ends the turn right after parseRequest when the AI is busy', async () => {
    const limited = {
      withStructuredOutput: () => ({
        invoke: async () => {
          throw Object.assign(new Error('429'), { status: 429 });
        },
      }),
    } as unknown as BaseChatModel;
    const out = await buildGraph({ parse: limited, present: fakeWriter }).invoke({
      messages: [new HumanMessage('OS')],
      school: 'SCOPE',
    });
    expect(out.messages.at(-1)?.content).toMatch(/can't reach the AI/);
    expect(out.resolved).toEqual([]); // resolveCourses never ran
  });

  it('keeps the whole conversation (messages are appended)', async () => {
    const out = await run({ courses: [{ query: 'OS' }] });
    expect(out.messages.map(m => m.getType())).toEqual(['human', 'ai']);
  });
});

describe('memory between messages (checkpointer, step 4.1)', () => {
  // A fake parser that answers each turn with the next form, and remembers the prompts it saw.
  function parserFor(forms: object[]) {
    const prompts: string[] = [];
    const model = {
      withStructuredOutput: () => ({
        invoke: async (prompt: string) => {
          prompts.push(prompt);
          return forms[prompts.length - 1];
        },
      }),
    } as unknown as BaseChatModel;
    return { model, prompts };
  }

  const thread = (id: string) => ({ configurable: { thread_id: id } });

  it('a second message in the same thread starts from the saved state', async () => {
    const parser = parserFor([
      { courses: [{ query: 'OS' }, { query: 'CN' }] },
      { courses: [{ query: 'OS' }, { query: 'CN' }], noClassesBefore: { time: '09:00' } },
    ]);
    const graph = buildGraph({
      parse: parser.model,
      present: fakeWriter,
      checkpointer: new MemorySaver(),
    });

    // Turn 1 sends the school; turn 2 sends ONLY the new message.
    await graph.invoke({ messages: [new HumanMessage('OS and CN')], school: 'SCOPE' }, thread('a'));
    const out = await graph.invoke({ messages: [new HumanMessage('no 8am')] }, thread('a'));

    expect(out.school).toBe('SCOPE'); // remembered, not sent again
    expect(out.messages.map(m => m.getType())).toEqual(['human', 'ai', 'human', 'ai']);
    expect(parser.prompts[1]).toContain('Previous form'); // turn 2 saw turn 1's wishes
    expect(parser.prompts[1]).toContain('"OS"');
  });

  it('threads are kept apart', async () => {
    const parser = parserFor([{ courses: [{ query: 'OS' }] }, { courses: [{ query: 'CN' }] }]);
    const graph = buildGraph({
      parse: parser.model,
      present: fakeWriter,
      checkpointer: new MemorySaver(),
    });
    await graph.invoke({ messages: [new HumanMessage('OS')], school: 'SCOPE' }, thread('a'));
    const other = await graph.invoke({ messages: [new HumanMessage('CN')] }, thread('b'));
    expect(other.school).toBeUndefined();
    expect(other.messages).toHaveLength(1); // only its own message so far
    expect(parser.prompts[1]).not.toContain('Previous form');
    // Thread b doesn't know a's school, so it's paused asking for it (4.2).
    expect((await graph.getState(thread('b'))).next).toEqual(['askSchool']);
  });

  it("never shows the last message's timetables when this one finds no course", async () => {
    const parser = parserFor([
      { courses: [{ query: 'OS' }, { query: 'CN' }] },
      { courses: [{ query: 'quantum cooking' }] },
    ]);
    const graph = buildGraph({
      parse: parser.model,
      present: fakeWriter,
      checkpointer: new MemorySaver(),
    });
    const first = await graph.invoke(
      { messages: [new HumanMessage('OS and CN')], school: 'SCOPE' },
      thread('a')
    );
    expect(first.ranked).toHaveLength(3);
    const second = await graph.invoke(
      { messages: [new HumanMessage('quantum cooking')] },
      thread('a')
    );
    expect(second.resolved).toEqual([]);
    expect(second.generated).toBeUndefined();
    expect(second.ranked).toEqual([]);
  });
});
