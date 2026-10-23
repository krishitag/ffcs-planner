// Measure how long the two LLM steps take (step 3.9), live.
//
//   npx tsx src/agent/scripts/latency.ts
//   LLM_MODEL=gemini-3.5-flash-lite npx tsx src/agent/scripts/latency.ts   # save quota
//
// For each request: parseRequest with the model's default thinking vs thinkingBudget 0 (same
// form or not?), then present once. Waits between calls so the free tier isn't hit too fast.
import { isDeepStrictEqual } from 'node:util';
import { getModel, DEFAULT_GEMINI_MODEL } from '../llm';
import { extractConstraints } from '../nodes/parseRequest';
import { resolveCourses } from '../nodes/resolveCourses';
import { generateNode } from '../nodes/generate';
import { filterAndRank } from '../nodes/filterAndRank';
import { buildFacts, writeAnswer } from '../nodes/present';
import type { AgentStateType } from '../state';
import type { Constraints } from '../constraints';

const REQUESTS = [
  'OS and CN, no 8am classes',
  'I want OS, CN and DBMS with Friday free, Brisilla for CN if possible',
  'compiler desgin and DBMS, nothing after 5pm, and keep thrusday free if possible',
];
const PAUSE_MS = 7000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value?: T; error?: string }> {
  const started = Date.now();
  try {
    const value = await run();
    return { ms: Date.now() - started, value };
  } catch (e) {
    return {
      ms: Date.now() - started,
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
    };
  }
}

async function main() {
  console.log(`model: ${process.env.LLM_MODEL ?? DEFAULT_GEMINI_MODEL}`);
  for (const text of REQUESTS) {
    console.log(`\n"${text}"`);

    const normal = await timed(() => extractConstraints(text, undefined, getModel()));
    console.log(
      `  parse, default thinking: ${normal.ms} ms${normal.error ? ` ❌ ${normal.error}` : ''}`
    );
    await sleep(PAUSE_MS);

    const noThink = await timed(() =>
      extractConstraints(text, undefined, getModel({ thinkingBudget: 0 }))
    );
    console.log(
      `  parse, thinkingBudget 0: ${noThink.ms} ms${noThink.error ? ` ❌ ${noThink.error}` : ''}`
    );
    if (normal.value && noThink.value) {
      const same = isDeepStrictEqual(normal.value, noThink.value);
      console.log(`  same form: ${same ? 'yes' : 'NO'}`);
      if (!same) {
        console.log(`    default: ${JSON.stringify(normal.value)}`);
        console.log(`    budget0: ${JSON.stringify(noThink.value)}`);
      }
    }
    await sleep(PAUSE_MS);

    const constraints = (normal.value ?? noThink.value) as Constraints | undefined;
    if (!constraints) continue;
    let s = {
      messages: [],
      school: 'SCOPE',
      constraints,
      resolved: [],
      unresolved: [],
      ranked: [],
      relaxRounds: { turn: 0, rounds: 0 },
    } as unknown as AgentStateType;
    const codeStarted = Date.now();
    s = { ...s, ...resolveCourses(s) };
    if (s.resolved.length > 0) {
      s = { ...s, ...generateNode(s) };
      s = { ...s, ...filterAndRank(s) };
    }
    const codeMs = Date.now() - codeStarted;
    const facts = buildFacts(s);
    const answer = await timed(() => writeAnswer(facts, getModel({ temperature: 0.3 })));
    console.log(
      `  code steps: ${codeMs} ms; fact sheet: ${JSON.stringify(facts, null, 1).length} chars`
    );
    console.log(
      `  present: ${answer.ms} ms${answer.value?.fallback ? ` (plain fallback, ${answer.value.fallback})` : ''}`
    );
    await sleep(PAUSE_MS);
  }
}

main();
