// Run with:  npx tsx src/agent/nodes/parseRequest.check.ts
// Sends a few real student messages to Gemini and prints the filled-in form for each.
import { extractConstraints } from './parseRequest';

const messages = [
  'I need OS, CN and DBMS with labs. No 8am classes, keep Friday free, and I want Prof Brisilla for CN.',
  'im in scope 2024 batch BAI. ML and DSA pls, mornings if possible, nothing after 5. dont want manivannan for OS',
  'keep fridday free and thrusday too',
  'OS in A1+TA1 ideally, and compiler design',
];

async function main() {
  for (const m of messages) {
    const started = Date.now();
    try {
      const form = await extractConstraints(m);
      console.log(`\n"${m}"\n→ (${Date.now() - started} ms)`, JSON.stringify(form, null, 1));
    } catch (e) {
      console.log(`\n"${m}"\n→ ❌ ${e instanceof Error ? e.message.slice(0, 300) : e}`);
    }
  }
}

main();
