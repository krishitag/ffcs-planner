// The whole agent as one LangGraph (step 3.8):
//
//   START → parseRequest ─┬─ understood → askSchool ─┬─ school known → resolveCourses → generate → filterAndRank ─┬─ timetables → present → END
//                         │                ⏸ asks    │                   ⏸ asks         ↑                          └─ nothing fits → relax ⏸ asks
//                         │                          └─ no courses listed (it replied) → END                                  ├─ relaxed a wish → generate (loop)
//                         └─ AI busy / not understood (it already replied) → END                                              └─ "none" / nothing to offer → present
//
// askSchool (4.2), resolveCourses (4.3) and relax (4.4) may PAUSE the graph with interrupt() to ask
// the student something; the caller resumes it with the answer (new Command({ resume })).
// Needs a checkpointer.
//
// Each node is thin; the logic lives in tools/ (tested without an LLM). Only parseRequest and
// present call the LLM. Models can be passed in so tests can use fakes.
//
// Memory (step 4.1): with a checkpointer, the state is saved after every node, per thread_id, so
// the next message in the same thread starts from the saved state. That's why every step runs on
// every turn (no shortcut past generate): each one overwrites its own results, so an answer can
// never show the previous message's timetables. With nothing found, generate and filterAndRank
// simply write "nothing" (about 1 ms).
import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AgentState, type AgentStateType } from './state';
import { parseRequest } from './nodes/parseRequest';
import { askSchool } from './nodes/askSchool';
import { resolveCourses } from './nodes/resolveCourses';
import { generateNode } from './nodes/generate';
import { filterAndRank } from './nodes/filterAndRank';
import { present } from './nodes/present';
import { MAX_RELAX_ROUNDS, relax, roundsThisTurn } from './nodes/relax';

// If the step that just ran already answered the student (the AI was unreachable, the message
// couldn't be understood, or their school has no courses), end the turn there; else go to `next`.
function unlessReplied<Next extends string>(next: Next) {
  return (state: AgentStateType): Next | typeof END =>
    state.messages.at(-1)?.getType() === 'ai' ? END : next;
}
export const afterParse = unlessReplied('askSchool');
export const afterAskSchool = unlessReplied('resolveCourses');

// After filterAndRank: nothing to show and a wish might be to blame → ask to relax one (4.4),
// at most MAX_RELAX_ROUNDS times per student message; otherwise explain.
export function afterRank(state: AgentStateType): 'relax' | 'present' {
  const stuck =
    state.ranked.length === 0 &&
    (state.generated?.status === 'courseImpossible' ||
      state.generated?.status === 'noTimetable' ||
      state.rankIssue === 'same building');
  return stuck && roundsThisTurn(state) < MAX_RELAX_ROUNDS ? 'relax' : 'present';
}

// checkpointer: where to save the state between messages (e.g. new MemorySaver()). Without one,
// each invoke starts from scratch (fine for tests of a single turn).
export function buildGraph({
  parse,
  present: presentModel,
  checkpointer,
}: {
  parse?: BaseChatModel;
  present?: BaseChatModel;
  checkpointer?: BaseCheckpointSaver;
} = {}) {
  return new StateGraph(AgentState)
    .addNode('parseRequest', state => parseRequest(state, parse))
    .addNode('askSchool', askSchool)
    .addNode('resolveCourses', resolveCourses)
    .addNode('generate', generateNode)
    .addNode('filterAndRank', filterAndRank)
    .addNode('relax', relax, { ends: ['generate', 'present'] }) // picks its next step (Command)
    .addNode('present', state => present(state, presentModel))
    .addEdge(START, 'parseRequest')
    .addConditionalEdges('parseRequest', afterParse, ['askSchool', END])
    .addConditionalEdges('askSchool', afterAskSchool, ['resolveCourses', END])
    .addEdge('resolveCourses', 'generate')
    .addEdge('generate', 'filterAndRank')
    .addConditionalEdges('filterAndRank', afterRank, ['relax', 'present'])
    .addEdge('present', END)
    .compile({ checkpointer });
}
