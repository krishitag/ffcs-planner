// The ONE place that decides which AI model the agent uses (step 3.2). Everything else just
// calls getModel(), so switching provider later is a change here only.
//
// Settings come from .env.local (gitignored, step 0.1):
//   LLM_PROVIDER=gemini
//   GOOGLE_API_KEY=...
//   LLM_MODEL=gemini-3.8-flash   (optional; this is the default)
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// A FIXED model version (D1), not an alias like "gemini-flash-latest", so the model can't change
// under us between eval runs. Gemini 2.5 Flash is closed to new users, so it's 3.8 Flash.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

// Next.js loads .env.local by itself; scripts run with tsx don't, so load it here if needed.
function loadEnv(): void {
  if (process.env.LLM_PROVIDER && process.env.GOOGLE_API_KEY) return;
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // No .env.local (e.g. on a server where the variables are set another way).
  }
}

// temperature: 0 = always the most likely answer (good for filling the constraints form);
// higher = more varied wording (fine for explanations).
export function getModel({ temperature = 0 }: { temperature?: number } = {}): BaseChatModel {
  loadEnv();
  const provider = process.env.LLM_PROVIDER ?? 'gemini';

  if (provider === 'gemini') {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is missing: add it to .env.local (see src/agent/README.md)');
    }
    const model = process.env.LLM_MODEL ?? DEFAULT_GEMINI_MODEL;
    return new ChatGoogleGenerativeAI({ model, temperature, apiKey });
  }

  throw new Error(`Unknown LLM_PROVIDER "${provider}" (supported: gemini)`);
}
