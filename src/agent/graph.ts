// The whole agent as one LangGraph (step 3.8):
//
//   START → parseRequest ─┬─ understood → resolveCourses → generate → filterAndRank → present → END
//                         └─ AI busy / not understood (it already replied) → END
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
import { resolveCourses } from './nodes/resolveCourses';
import { generateNode } from './nodes/generate';
import { filterAndRank } from './nodes/filterAndRank';
import { present } from './nodes/present';

// After parseRequest: if it already answered (the AI was unreachable or the message couldn't be
// understood), end the turn there; otherwise carry on.
export function afterParse(state: AgentStateType): 'resolveCourses' | typeof END {
  return state.messages.at(-1)?.getType() === 'ai' ? END : 'resolveCourses';
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
    .addNode('resolveCourses', resolveCourses)
    .addNode('generate', generateNode)
    .addNode('filterAndRank', filterAndRank)
    .addNode('present', state => present(state, presentModel))
    .addEdge(START, 'parseRequest')
    .addConditionalEdges('parseRequest', afterParse, ['resolveCourses', END])
    .addEdge('resolveCourses', 'generate')
    .addEdge('generate', 'filterAndRank')
    .addEdge('filterAndRank', 'present')
    .addEdge('present', END)
    .compile({ checkpointer });
}
