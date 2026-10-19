import { describe, it, expect } from 'vitest';
import { StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AgentState, courseFor, refFor } from './state';
import { loadCourses } from './data/loadCourses';

describe('AgentState', () => {
  // A tiny two-step graph, just to see how updates merge into the notebook.
  const graph = new StateGraph(AgentState)
    .addNode('first', () => ({ messages: [new AIMessage('hi')], school: 'SCOPE', relaxRounds: 1 }))
    .addNode('second', () => ({ messages: [new AIMessage('again')], relaxRounds: 2 }))
    .addEdge(START, 'first')
    .addEdge('first', 'second')
    .addEdge('second', END)
    .compile();

  it('appends messages but replaces everything else', async () => {
    const out = await graph.invoke({ messages: [new HumanMessage('OS and CN')] });
    expect(out.messages.map(m => m.content)).toEqual(['OS and CN', 'hi', 'again']); // appended
    expect(out.relaxRounds).toBe(2); // replaced
    expect(out.school).toBe('SCOPE'); // kept: "second" didn't mention it
  });

  it('starts lists empty and the relax counter at 0', async () => {
    const empty = await new StateGraph(AgentState)
      .addNode('noop', () => ({}))
      .addEdge(START, 'noop')
      .addEdge('noop', END)
      .compile()
      .invoke({ messages: [] });
    expect(empty.resolved).toEqual([]);
    expect(empty.ranked).toEqual([]);
    expect(empty.relaxRounds).toBe(0);
  });
});

describe('course references', () => {
  it('turn a stored pointer back into the full course', () => {
    const os = loadCourses().find(c => c.school === 'SCOPE' && c.code === 'BCSE303L')!;
    const ref = refFor(os);
    expect(ref).toEqual({ school: 'SCOPE', domain: 'DisciplineCore', key: os.key });
    expect(courseFor(ref)?.code).toBe('BCSE303L');
    expect(JSON.parse(JSON.stringify(ref))).toEqual(ref); // plain data: safe to save
  });
});
