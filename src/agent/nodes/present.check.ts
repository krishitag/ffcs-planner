// Run with:  npx tsx src/agent/nodes/present.check.ts
// Runs the code steps on two requests and prints what Gemini writes for each (live).
import { Constraints } from '../constraints';
import type { AgentStateType } from '../state';
import { resolveCourses } from './resolveCourses';
import { generateNode } from './generate';
import { filterAndRank } from './filterAndRank';
import { present } from './present';

async function show(title: string, wishes: object) {
  let s = {
    messages: [],
    school: 'SCOPE',
    constraints: Constraints.parse(wishes),
    resolved: [],
    unresolved: [],
    ranked: [],
    relaxRounds: { turn: 0, rounds: 0 },
  } as unknown as AgentStateType;
  s = { ...s, ...resolveCourses(s) };
  s = { ...s, ...generateNode(s) };
  s = { ...s, ...filterAndRank(s) };
  const started = Date.now();
  const update = await present(s);
  console.log(
    `\n===== ${title} (${Date.now() - started} ms) =====\n${update.messages?.[0].content}`
  );
}

async function main() {
  await show('OS + CN, Brisilla for CN if possible, nothing after 5 if possible', {
    courses: [{ query: 'OS' }, { query: 'CN', professor: { name: 'Brisilla', wish: 'prefer' } }],
    noClassesAfter: { time: '17:00', strength: 'prefer' },
  });
  await show('OS + CN + ML, Friday free', {
    courses: [{ query: 'OS' }, { query: 'CN' }, { query: 'ML' }],
    freeDays: [{ day: 'Fri' }],
  });
}

main();
