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
// thinkingBudget: how many "thinking" tokens the model may use before answering (0 = none);
// left out = the model's own default.
// For dev testing, LLM_MODEL set in the shell wins over .env.local, e.g.
//   LLM_MODEL=gemini-3.5-flash-lite npx tsx src/agent/scripts/chat.ts
export function getModel({
  temperature = 0,
  thinkingBudget,
}: { temperature?: number; thinkingBudget?: number } = {}): BaseChatModel {
  loadEnv();
  const provider = process.env.LLM_PROVIDER ?? 'gemini';

  if (provider === 'gemini') {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is missing: add it to .env.local (see src/agent/README.md)');
    }
    const model = process.env.LLM_MODEL ?? DEFAULT_GEMINI_MODEL;
    return new ChatGoogleGenerativeAI({
      model,
      temperature,
      apiKey,
      // No hidden retries inside LangChain (it would retry up to 6 times): callLlm below
      // decides when to retry, so there is one retry policy in one place.
      maxRetries: 0,
      ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
    });
  }

  throw new Error(`Unknown LLM_PROVIDER "${provider}" (supported: gemini)`);
}

// ---- Rate limits (429 Too Many Requests) ----

// The LLM can't be used right now (rate limit / quota). Nodes catch this and answer the
// student kindly instead of crashing.
export class LlmUnavailableError extends Error {
  constructor(message = 'The AI is busy right now (rate limit)') {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

// If we're told to wait at most this long, we wait and try once more; longer means fail fast.
export const MAX_RATE_LIMIT_WAIT_MS = 10_000;

// For a 429 error: how long Gemini says to wait, in ms (Infinity if it doesn't say).
// For any other error: undefined. Gemini puts the wait in the error details as
// { "@type": ".../google.rpc.RetryInfo", "retryDelay": "7s" }.
export function rateLimitWaitMs(error: unknown): number | undefined {
  const e = error as { status?: number; errorDetails?: { retryDelay?: string }[] };
  if (e?.status !== 429) return undefined;
  const delay = e.errorDetails?.find(d => typeof d?.retryDelay === 'string')?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : Infinity;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ---- Time limit (decided 2026-10-23: a student once waited 127s for an answer) ----

// One LLM call may take at most this long; then we give up and answer without it.
export const LLM_TIMEOUT_MS = 30_000;

// The LLM took too long. It's a kind of "unavailable", so nodes that catch LlmUnavailableError
// handle it too; present.ts tells the two apart for the fallback tag.
export class LlmTimeoutError extends LlmUnavailableError {
  constructor(ms: number) {
    super(`The AI took longer than ${ms / 1000}s`);
    this.name = 'LlmTimeoutError';
  }
}

// Runs one call, but stops waiting after `ms`. The signal also tells LangChain to cancel the
// request, so it doesn't keep running (and using quota) in the background.
async function withTimeout<T>(call: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new LlmTimeoutError(ms)); // first, so the race ends with OUR error...
      controller.abort(); // ...not with the "aborted" error the cancelled call throws
    }, ms);
  });
  try {
    return await Promise.race([call(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Makes one LLM call with our rules:
//   each try is stopped after 30s → LlmTimeoutError (no retry: the student has waited enough);
//   429 with a short wait (≤ 10s) → wait that long and try ONCE more;
//   429 with a long or no wait, or a second 429 → LlmUnavailableError (fail fast);
//   any other error → thrown as it is (the caller decides).
// `call` gets a signal to pass on to LangChain: model.invoke(prompt, { signal }).
export async function callLlm<T>(
  call: (signal: AbortSignal) => Promise<T>,
  wait = sleep,
  timeoutMs = LLM_TIMEOUT_MS
): Promise<T> {
  try {
    return await withTimeout(call, timeoutMs);
  } catch (error) {
    const waitMs = rateLimitWaitMs(error);
    if (waitMs === undefined) throw error;
    if (waitMs > MAX_RATE_LIMIT_WAIT_MS) throw new LlmUnavailableError();
    await wait(waitMs);
    try {
      return await withTimeout(call, timeoutMs);
    } catch (again) {
      if (rateLimitWaitMs(again) !== undefined) throw new LlmUnavailableError();
      throw again;
    }
  }
}
