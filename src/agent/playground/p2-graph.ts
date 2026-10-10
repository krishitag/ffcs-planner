// P.2: a toy graph. Run with:  npx tsx src/agent/playground/p2-graph.ts
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';

// 1) STATE = the shared notebook. Every box reads it and writes updates to it.
const State = Annotation.Root({
  // "count" has no reducer: a new value REPLACES the old one.
  count: Annotation<number>(),
  // "log" has a reducer: new entries are ADDED to the end instead of replacing.
  log: Annotation<string[]>({
    reducer: (oldList, newItems) => oldList.concat(newItems),
    default: () => [],
  }),
});

// 2) NODES = the boxes. Each one gets the notebook and returns ONLY what it changes.
function addOne(state: typeof State.State) {
  const newCount = state.count + 1;
  return { count: newCount, log: [`addOne: count is now ${newCount}`] };
}

function finish(state: typeof State.State) {
  return { log: [`finish: stopped at ${state.count}`] };
}

// 3) A DECISION for the arrow after addOne: look at the notebook, pick the next box.
function keepGoing(state: typeof State.State) {
  return state.count < 3 ? 'addOne' : 'finish';
}

// 4) EDGES = the arrows. Then compile() checks the wiring and makes it runnable.
const graph = new StateGraph(State)
  .addNode('addOne', addOne)
  .addNode('finish', finish)
  .addEdge(START, 'addOne') // always start at addOne
  .addConditionalEdges('addOne', keepGoing, ['addOne', 'finish']) // then decide
  .addEdge('finish', END) // finish ends it
  .compile();

async function main() {
  // Run it all and get the final notebook.
  console.log('=== Final state ===');
  console.log(await graph.invoke({ count: 0 }));

  // Run it again, printing what each box changed, step by step.
  console.log('\n=== Step by step ===');
  for await (const step of await graph.stream({ count: 0 }, { streamMode: 'updates' })) {
    console.log(step);
  }
}

main();
