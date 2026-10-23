import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Command, MemorySaver } from '@langchain/langgraph';
import { buildGraph } from '../graph';
import type { Question } from '../state';
import { searchCourses } from '../tools/searchCourses';
import { findBranch, optionsFor, readPick } from './resolveCourses';

// Fake LLMs: the parser returns the given forms in order (school already known, so only
// resolveCourses asks); the writer always says the same thing.
function graphWith(forms: object[]) {
  let turn = 0;
  const parse = {
    withStructuredOutput: () => ({ invoke: async () => forms[Math.min(turn++, forms.length - 1)] }),
  } as unknown as BaseChatModel;
  const present = { invoke: async () => ({ content: 'Here you go.' }) } as unknown as BaseChatModel;
  return buildGraph({ parse, present, checkpointer: new MemorySaver() });
}

const config = { configurable: { thread_id: 't' } };
const form = (...queries: string[]) => ({
  courses: queries.map(query => ({ query })),
  student: { school: 'SCOPE', batch: 2024 },
});
const say = (graph: ReturnType<typeof graphWith>, text: string) =>
  graph.invoke({ messages: [new HumanMessage(text)] }, config);
const answer = (graph: ReturnType<typeof graphWith>, text: string) =>
  graph.invoke(new Command({ resume: text }), config);

async function pending(graph: ReturnType<typeof graphWith>): Promise<Question | undefined> {
  const { tasks } = await graph.getState(config);
  return tasks.flatMap(t => t.interrupts)[0]?.value as Question | undefined;
}

describe('reading the answers', () => {
  it('finds one branch code', () => {
    expect(findBranch('BAI')).toBe('BAI');
    expect(findBranch("i'm bds")).toBe('BDS');
    expect(findBranch('computer science')).toBeUndefined();
    expect(findBranch('BAI or BDS')).toBeUndefined(); // two: not sure
  });

  it('reads a number, "none", or text to search for', () => {
    const r = searchCourses({ school: 'SCOPE', query: 'cloud' });
    const options = optionsFor(r.status === 'ambiguous' ? r.candidates : []);
    expect(readPick('2', options)).toEqual({ option: options[1] });
    expect(readPick('none of these', options)).toEqual({ leaveOut: true });
    expect(readPick('9', options)).toEqual({ search: '9' }); // not an option number
    expect(readPick('BCSE408L', options)).toEqual({ search: 'BCSE408L' });
  });

  it('shows one line per course, at most 5', () => {
    const r = searchCourses({ school: 'SCOPE', query: 'data', branch: 'BCE' });
    const options = optionsFor(r.status === 'ambiguous' ? r.candidates : []);
    expect(options).toHaveLength(5);
    expect(new Set(options.map(o => o.code)).size).toBe(5); // no course twice
  });
});

describe('resolveCourses asks about unclear courses (4.3)', () => {
  it('asks the branch once when a course is in several groups', async () => {
    const graph = graphWith([form('ML', 'deep learning')]);
    await say(graph, 'ML and deep learning');

    const q = await pending(graph);
    expect(q?.question).toMatch(
      /several groups: DisciplineElective, [\s\S]*BAI[\s\S]*Which branch/
    );

    const out = await answer(graph, 'BAI'); // settles BOTH courses
    expect(await pending(graph)).toBeUndefined();
    expect(out.branch).toBe('BAI');
    expect(out.resolved.map(r => r.ref.domain)).toEqual([
      'Specialization Elective - BAI',
      'Specialization Elective - BAI',
    ]);
  });

  it('asks again if the answer has no branch code', async () => {
    const graph = graphWith([form('ML')]);
    await say(graph, 'ML');
    await answer(graph, 'computer science');
    expect((await pending(graph))?.question).toMatch(/I need your branch code/);
    const out = await answer(graph, 'BCE');
    expect(out.resolved[0].ref.domain).toBe('DisciplineElective');
  });

  it('offers numbered options for similar courses, and remembers the pick', async () => {
    const graph = graphWith([form('OS', 'cloud'), form('OS', 'cloud')]);
    await say(graph, 'OS and cloud');

    const q = await pending(graph);
    expect(q?.question).toMatch(/Which course did you mean by "cloud"/);
    expect(q?.options).toEqual(['BCSE408L Cloud Computing', 'BCSE355L Cloud Architecture Design']);

    const out = await answer(graph, '1');
    expect(out.resolved.map(r => r.ref.key.split(' - ')[0])).toEqual(['BCSE303L', 'BCSE408L']);
    expect(out.messages.at(-1)?.content).toBe('Here you go.');

    // Next message still mentions "cloud": no question this time.
    const next = await say(graph, 'no 8am');
    expect(await pending(graph)).toBeUndefined();
    expect(next.resolved.map(r => r.ref.key.split(' - ')[0])).toEqual(['BCSE303L', 'BCSE408L']);
  });

  it('accepts a typed code, and asks again if what they typed is not found', async () => {
    const graph = graphWith([form('java')]);
    await say(graph, 'java');
    await answer(graph, 'underwater basket weaving');
    expect((await pending(graph))?.question).toMatch(
      /couldn't find "underwater basket weaving" in SCOPE/
    );
    const out = await answer(graph, 'BCSE405L');
    expect(out.resolved[0].ref.key).toMatch(/^BCSE405L/);
  });

  it('"none" leaves the course out, and is remembered too', async () => {
    const graph = graphWith([form('OS', 'java'), form('OS', 'java')]);
    await say(graph, 'OS and java');
    const out = await answer(graph, 'none');
    expect(out.resolved).toHaveLength(1);
    expect(out.courseChoices).toEqual({ java: null });

    await say(graph, 'again');
    expect(await pending(graph)).toBeUndefined();
  });
});
