// The whole agent as one LangGraph (step 3.8):
//
//   START → parseRequest ─┬─ understood → resolveCourses ─┬─ some found → generate → filterAndRank → present → END
//                         │                               └─ none found ─────────────────────────→ present
//                         └─ AI busy / not understood (it already replied) → END
//
// Each node is thin; the logic lives in tools/ (tested without an LLM). Only parseRequest and
// present call the LLM. Models can be passed in so tests can use fakes.
import { StateGraph, START, END } from '@langchain/langgraph';
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

// After resolveCourses: anything to generate?
export function afterResolve(state: AgentStateType): 'generate' | 'present' {
  return state.resolved.length > 0 ? 'generate' : 'present';
}

export function buildGraph(models: { parse?: BaseChatModel; present?: BaseChatModel } = {}) {
  return new StateGraph(AgentState)
    .addNode('parseRequest', state => parseRequest(state, models.parse))
    .addNode('resolveCourses', resolveCourses)
    .addNode('generate', generateNode)
    .addNode('filterAndRank', filterAndRank)
    .addNode('present', state => present(state, models.present))
    .addEdge(START, 'parseRequest')
    .addConditionalEdges('parseRequest', afterParse, ['resolveCourses', END])
    .addConditionalEdges('resolveCourses', afterResolve, ['generate', 'present'])
    .addEdge('generate', 'filterAndRank')
    .addEdge('filterAndRank', 'present')
    .addEdge('present', END)
    .compile();
}
