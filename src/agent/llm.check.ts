// Run with:  npx tsx src/agent/llm.check.ts
// Sends Gemini one tiny message to check the key and model work. Never prints the key.
import { getModel, DEFAULT_GEMINI_MODEL } from './llm';

async function main() {
  const started = Date.now();
  try {
    const reply = await getModel().invoke('Reply with exactly one word: pong');
    console.log(
      `✅ ${process.env.LLM_MODEL ?? DEFAULT_GEMINI_MODEL} answered in ${Date.now() - started} ms: "${String(reply.content).trim()}"`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`❌ Gemini call failed: ${msg.slice(0, 300)}`);
    process.exitCode = 1;
  }
}

main();
