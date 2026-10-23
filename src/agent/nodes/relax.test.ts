import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Command, MemorySaver } from '@langchain/langgraph';
import { buildGraph } from '../graph';
import type { Question } from '../state';

// Fake LLMs: the parser returns the given forms in order (school known, so only relax asks).
function graphWith(forms: object[]) {
  let turn = 0;
  const parse = {
    withStructuredOutput: () => ({ invoke: async () => forms[Math.min(turn++, forms.length - 1)] }),
  } as unknown as BaseChatModel;
  const present = { invoke: async () => ({ content: 'Here you go.' }) } as unknown as BaseChatModel;
  return buildGraph({ parse, present, checkpointer: new MemorySaver() });
}

const config = { configurable: { thread_id: 't' } };
const student = { school: 'SCOPE', batch: 2024 };
const say = (graph: ReturnType<typeof graphWith>, text: string) =>
  graph.invoke({ messages: [new HumanMessage(text)] }, config);
const answer = (graph: ReturnType<typeof graphWith>, text: string) =>
  graph.invoke(new Command({ resume: text }), config);

async function pending(graph: ReturnType<typeof graphWith>): Promise<Question | undefined> {
  const { tasks } = await graph.getState(config);
  return tasks.flatMap(t => t.interrupts)[0]?.value as Question | undefined;
}

const osCnFriFree = {
  courses: [{ query: 'OS' }, { query: 'CN' }],
  freeDays: [{ day: 'Fri' }],
  student,
};

describe('relax: when nothing fits, ask which wish to soften (4.4)', () => {
  it('asks with the reason and the numbered choices', async () => {
    const graph = graphWith([osCnFriFree]);
    await say(graph, 'OS and CN, Friday free');
    const q = await pending(graph);
    expect(q?.question).toMatch(/^Nothing fits: no section of CN fits Fri free\./);
    expect(q?.options).toHaveLength(1);
    expect(q?.options?.[0]).toMatch(/^"Fri free" → \d+ timetables$/);
  });

  it('a pick makes the wish "if possible" and loops back to generate', async () => {
    const graph = graphWith([osCnFriFree]);
    await say(graph, 'OS and CN, Friday free');
    const out = await answer(graph, '1');

    expect(await pending(graph)).toBeUndefined();
    expect(out.constraints?.freeDays).toEqual([{ day: 'Fri', strength: 'prefer' }]);
    expect(out.generated?.status).toBe('ok');
    expect(out.ranked.length).toBeGreaterThan(0);
    expect(out.relaxRounds).toEqual({ turn: 1, rounds: 1 });
    expect(out.messages.at(-1)?.content).toBe('Here you go.');
  });

  it('"none" keeps the wishes and goes on to explain', async () => {
    const graph = graphWith([osCnFriFree]);
    await say(graph, 'OS and CN, Friday free');
    const out = await answer(graph, 'none');
    expect(await pending(graph)).toBeUndefined();
    expect(out.constraints?.freeDays).toEqual([{ day: 'Fri', strength: 'must' }]);
    expect(out.ranked).toEqual([]);
    expect(out.messages.at(-1)?.content).toBe('Here you go.');
  });

  it('asks again on an answer it cannot read', async () => {
    const graph = graphWith([osCnFriFree]);
    await say(graph, 'OS and CN, Friday free');
    await answer(graph, 'hmm, Friday I guess');
    expect((await pending(graph))?.question).toMatch(/Please reply with a number from 1 to 1/);
  });

  it('asks again in the same message if the first relax is not enough', async () => {
    // Mornings only + no 8am kills OS (its only morning slot is Tuesday 08:00), and Fri free
    // kills CN: two separate problems, so two rounds.
    const graph = graphWith([
      {
        courses: [{ query: 'OS' }, { query: 'CN' }],
        freeDays: [{ day: 'Fri' }],
        shift: { value: 'morning' },
        noClassesBefore: { time: '09:00' },
        student,
      },
    ]);
    await say(graph, 'OS and CN, mornings, no 8am, Friday free');
    expect((await pending(graph))?.question).toMatch(/no section of OS fits/);
    await answer(graph, '1');
    expect((await pending(graph))?.question).toMatch(/no section of CN fits Fri free/);
    const out = await answer(graph, '1');
    expect(out.relaxRounds).toEqual({ turn: 1, rounds: 2 });
    expect(out.ranked.length).toBeGreaterThan(0);
  });
});
