// Graph step 4b (4.4): nothing fits, so ask which wish the student can live without.
//   1. Code works out the choices and how many timetables each gives (tools/relax.ts).
//   2. PAUSE with interrupt() and ask, as numbered options (code writes the question; decided
//      2026-10-23: instant, and the numbers can't be wrong).
//   3. Their pick becomes "if possible" in `constraints`, and the graph goes back to generate.
//      "none" goes on to present, which explains why nothing fits.
// This node picks its own next step by returning a Command({ update, goto }), instead of a
// conditional edge after it, because the choice depends on the student's answer.
//
// Writes `constraints` too (the one exception to one-writer-per-field: parseRequest fills the
// form, relax only softens a wish in it) and `relaxRounds`.
import { Command, interrupt } from '@langchain/langgraph';
import { Constraints } from '../constraints';
import { courseFor, type AgentStateType, type Question } from '../state';
import { relaxOptions, relaxWishes, type RelaxableWish, type RelaxOption } from '../tools/relax';
import { buildFacts, describeWish } from './present';

// Safety net: at most this many relax questions per student message (each round also removes at
// least one "must" wish, so the loop can't go on forever anyway).
export const MAX_RELAX_ROUNDS = 3;

// Which student message we're on (the number of their messages so far); rounds reset with each.
export const turnOf = (state: AgentStateType) =>
  state.messages.filter(m => m.getType() === 'human').length;

// Rounds asked so far for THIS message.
export function roundsThisTurn(state: AgentStateType): number {
  return state.relaxRounds.turn === turnOf(state) ? state.relaxRounds.rounds : 0;
}

const describe = (w: RelaxableWish) =>
  w.kind === 'sameBuilding' ? 'same building' : describeWish(w);

export function relaxQuestion(why: string, options: RelaxOption[], problem?: string): Question {
  const ask =
    `Nothing fits: ${why}. Which wish can I make "if possible" instead? ` +
    'Reply with a number, or "none" to keep them all.';
  return {
    question: problem ? `${problem}\n${ask}` : ask,
    options: options.map(o => {
      const what = o.relax.map(w => `"${describe(w)}"`).join(' and ');
      const result =
        o.timetables === 'many'
          ? 'lots of timetables'
          : o.timetables > 0
            ? `${o.timetables} timetable${o.timetables === 1 ? '' : 's'}`
            : 'still not enough on its own';
      return `${what} → ${result}`;
    }),
  };
}

export function relax(state: AgentStateType): Command {
  const constraints = state.constraints ?? Constraints.parse({});
  const courses = state.resolved.flatMap(r => {
    const course = courseFor(r.ref);
    return course ? [{ query: r.query, course }] : [];
  });
  const options = relaxOptions({
    generated: state.generated,
    rankIssue: state.rankIssue,
    courses,
    constraints,
  });
  if (options.length === 0) return new Command({ goto: 'present' }); // nothing to offer

  const why = buildFacts(state).noTimetable?.why ?? 'no timetable fits all your wishes';
  let problem: string | undefined;
  for (;;) {
    const answer = String(interrupt(relaxQuestion(why, options, problem))).trim();
    if (/^(none|no|keep( them)?( all)?|neither)\.?$/i.test(answer)) {
      return new Command({ goto: 'present' });
    }
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      return new Command({
        update: {
          constraints: relaxWishes(constraints, options[n - 1].relax),
          relaxRounds: { turn: turnOf(state), rounds: roundsThisTurn(state) + 1 },
        },
        goto: 'generate',
      });
    }
    problem = `Please reply with a number from 1 to ${options.length}, or "none".`;
  }
}
