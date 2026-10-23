import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Command, MemorySaver } from '@langchain/langgraph';
import { buildGraph } from '../graph';

// Fake LLMs: the parser returns the given forms in order; the writer always says the same thing.
function graphWith(forms: object[]) {
  let turn = 0;
  const parse = {
    withStructuredOutput: () => ({ invoke: async () => forms[Math.min(turn++, forms.length - 1)] }),
  } as unknown as BaseChatModel;
  const present = { invoke: async () => ({ content: 'Here you go.' }) } as unknown as BaseChatModel;
  return buildGraph({ parse, present, checkpointer: new MemorySaver() });
}

const config = { configurable: { thread_id: 't' } };
const osAndCn = { courses: [{ query: 'OS' }, { query: 'CN' }] };

// The question the graph is paused on, if any.
async function pendingQuestion(graph: ReturnType<typeof graphWith>): Promise<string | undefined> {
  const { tasks } = await graph.getState(config);
  return (tasks.flatMap(t => t.interrupts)[0]?.value as { question: string } | undefined)?.question;
}

describe('askSchool: ask once, then remember (4.2)', () => {
  it('pauses to ask, then carries on with the answer', async () => {
    const graph = graphWith([osAndCn]);
    await graph.invoke({ messages: [new HumanMessage('OS and CN')] }, config);

    expect(await pendingQuestion(graph)).toMatch(/Which school's course list/);
    expect((await graph.getState(config)).next).toEqual(['askSchool']); // paused here

    const out = await graph.invoke(new Command({ resume: 'scope 2024' }), config);
    expect(out.school).toBe('SCOPE');
    expect(out.batch).toBe(2024);
    expect(out.ranked).toHaveLength(3);
    expect(await pendingQuestion(graph)).toBeUndefined();
  });

  it('never asks again in the same thread', async () => {
    const graph = graphWith([osAndCn, { courses: [{ query: 'OS' }] }]);
    await graph.invoke({ messages: [new HumanMessage('OS and CN')] }, config);
    await graph.invoke(new Command({ resume: 'SCOPE 2025' }), config);

    const out = await graph.invoke({ messages: [new HumanMessage('just OS')] }, config);
    expect(await pendingQuestion(graph)).toBeUndefined();
    expect(out.school).toBe("SCOPE ('25 Batch)");
  });

  it("doesn't ask when the student already said it", async () => {
    const graph = graphWith([{ ...osAndCn, student: { school: 'SCOPE', batch: 2024 } }]);
    const out = await graph.invoke(
      { messages: [new HumanMessage('OS and CN, SCOPE 2024')] },
      config
    );
    expect(await pendingQuestion(graph)).toBeUndefined();
    expect(out.school).toBe('SCOPE');
  });

  it('asks again, keeping what it has, until a list fits', async () => {
    const graph = graphWith([osAndCn]);
    await graph.invoke({ messages: [new HumanMessage('OS and CN')] }, config);

    await graph.invoke(new Command({ resume: 'SCOPE' }), config); // no year
    expect(await pendingQuestion(graph)).toMatch(/still need the year you joined/);

    await graph.invoke(new Command({ resume: '2026' }), config); // no list for 2026
    expect(await pendingQuestion(graph)).toMatch(/don't have a SCOPE course list for the 2026/);

    const out = await graph.invoke(new Command({ resume: '2024' }), config); // SCOPE kept
    expect(out.school).toBe('SCOPE');
  });

  it('says plainly when the list has no courses, and ends the turn', async () => {
    const graph = graphWith([{ ...osAndCn, student: { school: 'SCE', batch: 2024 } }]);
    const out = await graph.invoke({ messages: [new HumanMessage('OS, SCE 2024')] }, config);
    expect(out.messages.at(-1)?.content).toBe('No courses are listed for SCE yet.');
    expect(out.school).toBeUndefined();
    expect(out.resolved).toEqual([]); // resolveCourses never ran
  });
});
