// Chat with the agent in the terminal (step 3.8; memory from step 4.1).
//
//   npx tsx src/agent/scripts/chat.ts                       # chat, school SCOPE
//   npx tsx src/agent/scripts/chat.ts --school SCORE --branch BAI
//   npx tsx src/agent/scripts/chat.ts --once "OS and CN, no 8am"
//
// The graph remembers the conversation itself (MemorySaver, one thread per chat): this script only
// sends each NEW message. Type "new" to start a fresh thread. Memory is lost when the script exits.
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { buildGraph } from '../graph';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const graph = buildGraph({ checkpointer: new MemorySaver() });
const school = flag('school') ?? 'SCOPE';
const branch = flag('branch');

// Which conversation we're in. A new id = a new, empty thread.
let config = { configurable: { thread_id: randomUUID() } };
let firstTurn = true;

async function ask(text: string) {
  // The first message also says who the student is (until 4.2 asks for it); after that the saved
  // state already has it. Only the new message is sent: the messages reducer APPENDS it to the
  // saved conversation (sending the whole list again would store every message twice).
  const input = firstTurn
    ? { messages: [new HumanMessage(text)], school, branch }
    : { messages: [new HumanMessage(text)] };
  firstTurn = false;

  const timings: string[] = [];
  let last = Date.now();
  // stream({ streamMode: 'updates' }) gives each node's update as soon as that node finishes.
  for await (const update of await graph.stream(input, { ...config, streamMode: 'updates' })) {
    timings.push(`${Object.keys(update)[0]} ${Date.now() - last}ms`);
    last = Date.now();
  }

  // The saved state after this turn: the answer is the last message.
  const { values } = await graph.getState(config);
  const answer = (values.messages as BaseMessage[]).at(-1);

  // present marks a code-written answer used instead of the LLM's (see present.ts).
  const fallback = answer?.additional_kwargs?.fallback;
  console.log(`\nAgent:\n${answer?.content ?? '(no answer)'}`);
  console.log(
    `\n[${timings.join(' → ')}]${fallback ? ` [present: plain fallback, ${fallback}]` : ''}`
  );
}

async function main() {
  const once = flag('once');
  if (once) return ask(once);

  console.log(
    `FFCS planner (school ${school}${branch ? `, branch ${branch}` : ''}). ` +
      `Type "new" for a fresh conversation, "exit" to quit.`
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const text = (await rl.question('\nYou: ')).trim();
    if (!text || text === 'exit') break;
    if (text === 'new') {
      config = { configurable: { thread_id: randomUUID() } };
      firstTurn = true;
      console.log('(new conversation)');
      continue;
    }
    await ask(text);
  }
  rl.close();
}

main();
