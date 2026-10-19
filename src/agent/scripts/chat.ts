// Chat with the agent in the terminal (step 3.8).
//
//   npx tsx src/agent/scripts/chat.ts                       # chat, school SCOPE
//   npx tsx src/agent/scripts/chat.ts --school SCORE --branch BAI
//   npx tsx src/agent/scripts/chat.ts --once "OS and CN, no 8am"
//
// Phase 3 has no memory between runs yet (that's the Phase 4 checkpointer); within one chat,
// the conversation, school and wishes are carried from message to message by this script.
import { createInterface } from 'node:readline/promises';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { buildGraph } from '../graph';
import type { Constraints } from '../constraints';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const graph = buildGraph();
let messages: BaseMessage[] = [];
let constraints: Constraints | undefined;
let school = flag('school') ?? 'SCOPE';
let branch = flag('branch');

async function ask(text: string) {
  messages = [...messages, new HumanMessage(text)];
  const timings: string[] = [];
  let last = Date.now();
  let state: Record<string, unknown> = {};

  // stream({ streamMode: 'updates' }) gives each node's update as soon as that node finishes.
  for await (const update of await graph.stream(
    { messages, school, branch, constraints },
    { streamMode: 'updates' }
  )) {
    const [node, change] = Object.entries(update)[0];
    timings.push(`${node} ${Date.now() - last}ms`);
    last = Date.now();
    state = { ...state, ...(change as object) };
  }

  const answer = (state.messages as BaseMessage[] | undefined)?.at(-1);
  if (answer) messages = [...messages, answer];
  constraints = (state.constraints as Constraints | undefined) ?? constraints;
  school = (state.school as string | undefined) ?? school;
  branch = (state.branch as string | undefined) ?? branch;

  console.log(`\nAgent:\n${answer?.content ?? '(no answer)'}`);
  console.log(`\n[${timings.join(' → ')}]`);
}

async function main() {
  const once = flag('once');
  if (once) return ask(once);

  console.log(
    `FFCS planner (school ${school}${branch ? `, branch ${branch}` : ''}). Type "exit" to quit.`
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const text = (await rl.question('\nYou: ')).trim();
    if (!text || text === 'exit') break;
    await ask(text);
  }
  rl.close();
}

main();
