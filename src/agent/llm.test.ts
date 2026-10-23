import { describe, it, expect } from 'vitest';
import { callLlm, LlmTimeoutError, LlmUnavailableError, rateLimitWaitMs } from './llm';

// A 429 error shaped like the ones Gemini's library throws (status + errorDetails).
const rateLimited = (retryDelay?: string) =>
  Object.assign(new Error('[429 Too Many Requests]'), {
    status: 429,
    errorDetails: retryDelay
      ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }]
      : [],
  });

// A call that fails with the given errors first, then returns 'ok'; counts its calls.
function flaky(errors: Error[]) {
  let calls = 0;
  const call = async () => {
    const error = errors[calls++];
    if (error) throw error;
    return 'ok';
  };
  return { call, calls: () => calls };
}

const waited: number[] = [];
const fakeWait = async (ms: number) => {
  waited.push(ms);
};

describe('rateLimitWaitMs', () => {
  it('reads the wait Gemini asks for', () => {
    expect(rateLimitWaitMs(rateLimited('7s'))).toBe(7000);
    expect(rateLimitWaitMs(rateLimited('2.5s'))).toBe(2500);
  });

  it('is Infinity for a 429 with no wait, undefined for other errors', () => {
    expect(rateLimitWaitMs(rateLimited())).toBe(Infinity);
    expect(rateLimitWaitMs(new Error('network'))).toBeUndefined();
  });
});

describe('callLlm: the rate-limit rule', () => {
  it('waits a short delay and tries once more', async () => {
    waited.length = 0;
    const f = flaky([rateLimited('3s')]);
    expect(await callLlm(f.call, fakeWait)).toBe('ok');
    expect(waited).toEqual([3000]);
    expect(f.calls()).toBe(2);
  });

  it('fails fast on a long or missing delay (no retry, saves quota)', async () => {
    for (const error of [rateLimited('45s'), rateLimited()]) {
      const f = flaky([error]);
      await expect(callLlm(f.call, fakeWait)).rejects.toBeInstanceOf(LlmUnavailableError);
      expect(f.calls()).toBe(1);
    }
  });

  it('gives up after a second 429', async () => {
    const f = flaky([rateLimited('1s'), rateLimited('1s')]);
    await expect(callLlm(f.call, fakeWait)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(f.calls()).toBe(2);
  });

  it('passes other errors through untouched', async () => {
    const f = flaky([new Error('bad output')]);
    await expect(callLlm(f.call, fakeWait)).rejects.toThrow('bad output');
    expect(f.calls()).toBe(1);
  });
});

describe('callLlm: the time limit', () => {
  // A call that only finishes if nobody cancels it; remembers whether it was cancelled.
  function slow(ms: number) {
    let cancelled = false;
    const call = (signal: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => resolve('late'), ms);
        signal.addEventListener('abort', () => {
          cancelled = true;
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    return { call, cancelled: () => cancelled };
  }

  it('gives up after the limit with LlmTimeoutError, and cancels the request', async () => {
    const s = slow(1000);
    const error = await callLlm(s.call, fakeWait, 20).catch(e => e);
    expect(error).toBeInstanceOf(LlmTimeoutError);
    expect(error).toBeInstanceOf(LlmUnavailableError); // so nodes treat it like "busy"
    expect(s.cancelled()).toBe(true);
  });

  it('leaves a call that finishes in time alone', async () => {
    const s = slow(5);
    expect(await callLlm(s.call, fakeWait, 1000)).toBe('late');
    expect(s.cancelled()).toBe(false);
  });
});
