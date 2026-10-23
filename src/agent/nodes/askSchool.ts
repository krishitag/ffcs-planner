// Graph step 1b (4.2): know which course list the student uses, asking only once per thread.
//   1. Already known (saved by the checkpointer from an earlier turn)? Do nothing.
//   2. Did they say it in their message (parseRequest's form, `student`)? Use it, no question.
//   3. Otherwise PAUSE the graph with interrupt() and ask. The caller (chat.ts) shows the question
//      and resumes with the answer: graph.invoke(new Command({ resume: "scope 2024" }), config).
// Plain code reads the answer (tools/findSchool.ts). If no list fits, it explains and asks again.
// The only writer of `school` and `batch` (state.ts).
import { interrupt } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { findBatch, findProgram, findSchool, offeredPrograms } from '../tools/findSchool';
import type { AgentStateType } from '../state';

// What the graph hands to the caller when it pauses (4.3 will add options to pick from).
export type Question = { question: string };

export function schoolQuestion(problem?: string): Question {
  const ask =
    "Which school's course list do you use on FFCS-inator, and which year did you join? " +
    'For example: "SCOPE 2024" or "SENSE, 2025 batch".\n' +
    `Schools: ${offeredPrograms().join(', ')}.`;
  return { question: problem ? `${problem}\n${ask}` : ask };
}

export function askSchool(state: AgentStateType): Partial<AgentStateType> {
  if (state.school) return {}; // asked (or told) before in this thread: never ask again

  // What the student already said in their message, if anything. Answers add to it, so
  // "SCOPE" then "2024" works without repeating the school.
  const said = state.constraints?.student;
  let program = said?.school ? findProgram(said.school) : undefined;
  let batch = said?.batch;
  let result = findSchool(program, batch);
  let problem: string | undefined;

  // Ask until we get a list that exists. On resume this node re-runs from the top and each
  // interrupt() returns its saved answer in order, so everything above must be safe to repeat
  // (it is: it only reads state).
  while (result.status !== 'found') {
    if (result.status === 'noCourses') {
      // The list exists but is empty: asking again can't help, so say so and end the turn.
      return { messages: [new AIMessage(`No courses are listed for ${result.school} yet.`)] };
    }
    if (result.status === 'noList') {
      problem = `I don't have a ${result.program} course list for the ${result.batch} batch.`;
    }
    const answer = String(interrupt(schoolQuestion(problem)));
    program = findProgram(answer) ?? program;
    batch = findBatch(answer) ?? batch;
    result = findSchool(program, batch);
    if (result.status === 'needMore') {
      const what = result.missing.map(m =>
        m === 'program' ? 'your school' : 'the year you joined'
      );
      problem = `Sorry, I still need ${what.join(' and ')}.`;
    }
  }
  return { school: result.school, batch: result.batch };
}
