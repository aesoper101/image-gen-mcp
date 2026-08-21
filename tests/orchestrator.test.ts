import { expect, test } from '@rstest/core';
import { ImageGenError } from '../src/core/errors';
import type {
  GenerateParams,
  GenerateResult,
  ImageProvider,
} from '../src/core/types';
import { generateWithFailover } from '../src/orchestrator';

/** Fake provider with a programmable failure queue; succeeds once the queue is empty. */
function makeProvider(
  id: string,
  errors: ImageGenError[] = [],
): ImageProvider & { calls: number } {
  const provider = {
    id,
    models: [`model-${id}`],
    defaultModel: `model-${id}`,
    calls: 0,
    async generate(_params: GenerateParams): Promise<GenerateResult> {
      provider.calls++;
      const fail = errors.shift();
      if (fail) throw fail;
      return {
        images: [{ data: `img-${id}`, format: 'url', mimeType: 'image/png' }],
      };
    },
  };
  return provider;
}

const baseOpts = { maxRetries: 2, maxDegradations: 1, retryBackoffMs: 1000 };

test('succeeds on the highest-priority provider without trying others', async () => {
  const primary = makeProvider('openai');
  const secondary = makeProvider('zhipu');
  const result = await generateWithFailover(
    [primary, secondary],
    { prompt: 'cat' },
    baseOpts,
  );

  expect(result.provider).toBe('openai');
  expect(primary.calls).toBe(1);
  expect(secondary.calls).toBe(0);
  expect(result.attempts).toEqual([
    { provider: 'openai', model: 'model-openai', status: 'success' },
  ]);
});

test('retries retryable errors within a provider up to maxRetries', async () => {
  const primary = makeProvider('openai', [
    new ImageGenError('retryable', '429 rate limited', { status: 429 }),
    new ImageGenError('retryable', 'timeout'),
  ]);
  const result = await generateWithFailover(
    [primary],
    { prompt: 'cat' },
    baseOpts,
  );

  expect(primary.calls).toBe(3); // 1 success + 2 failures
  expect(result.attempts).toHaveLength(3);
  expect(result.attempts.at(-1)?.status).toBe('success');
});

test('fails over to the next provider after retries are exhausted', async () => {
  const primary = makeProvider('openai', [
    new ImageGenError('retryable', 'boom'),
    new ImageGenError('retryable', 'boom'),
    new ImageGenError('retryable', 'boom'),
  ]);
  const secondary = makeProvider('zhipu');
  const result = await generateWithFailover(
    [primary, secondary],
    { prompt: 'cat' },
    baseOpts,
  );

  expect(result.provider).toBe('zhipu');
  expect(primary.calls).toBe(3); // maxRetries+1 failures
  expect(secondary.calls).toBe(1);
  expect(result.attempts[0]?.status).toBe('failed');
  expect(result.attempts[3]?.status).toBe('success');
});

test('non-retryable errors skip retries and fail over immediately', async () => {
  const primary = makeProvider('openai', [
    new ImageGenError('non-retryable', '401 bad key', { status: 401 }),
  ]);
  const secondary = makeProvider('zhipu');
  const result = await generateWithFailover(
    [primary, secondary],
    { prompt: 'cat' },
    baseOpts,
  );

  expect(primary.calls).toBe(1);
  expect(result.provider).toBe('zhipu');
});

test('maxDegradations=0 tries only the highest-priority provider', async () => {
  const primary = makeProvider('openai', [
    new ImageGenError('retryable', 'boom'),
    new ImageGenError('retryable', 'boom'),
    new ImageGenError('retryable', 'boom'),
  ]);
  const secondary = makeProvider('zhipu');
  await expect(
    generateWithFailover(
      [primary, secondary],
      { prompt: 'cat' },
      { ...baseOpts, maxDegradations: 0 },
    ),
  ).rejects.toThrow(/Image generation failed/);
  expect(secondary.calls).toBe(0);
});

test('total failure throws a final error with a sanitized attempt summary', async () => {
  const primary = makeProvider('openai', [
    new ImageGenError('non-retryable', '401 sk-abcdef1234567890secret', {
      status: 401,
    }),
  ]);
  await expect(
    generateWithFailover([primary], { prompt: 'cat' }, baseOpts),
  ).rejects.toThrow(/openai\/model-openai: 401 sk-abcdef…/);
});

test('attempt error messages are sanitized', async () => {
  const primary = makeProvider('openai', [
    new ImageGenError(
      'retryable',
      'failed with Bearer sk-abcdef1234567890secret',
    ),
  ]);
  const secondary = makeProvider('zhipu');
  const result = await generateWithFailover(
    [primary, secondary],
    { prompt: 'cat' },
    baseOpts,
  );

  expect(result.attempts[0]?.error).toContain('Bearer ***');
  expect(result.attempts[0]?.error).not.toContain('sk-abcdef1234567890secret');
});

test('backoff grows exponentially via injected sleep', async () => {
  const sleeps: number[] = [];
  const primary = makeProvider('openai', [
    new ImageGenError('retryable', 'boom'),
    new ImageGenError('retryable', 'boom'),
  ]);
  const secondary = makeProvider('zhipu');
  await generateWithFailover(
    [primary, secondary],
    { prompt: 'cat' },
    {
      ...baseOpts,
      maxRetries: 1,
      retryBackoffMs: 500,
      sleep: async (ms) => sleeps.push(ms),
    },
  );

  expect(sleeps).toEqual([500]); // 1 retry, backoff = base * 2^0
});

test('providers beyond maxDegradations are not tried', async () => {
  const a = makeProvider('openai', [
    new ImageGenError('non-retryable', 'x', { status: 400 }),
  ]);
  const b = makeProvider('zhipu', [
    new ImageGenError('non-retryable', 'x', { status: 400 }),
  ]);
  const c = makeProvider('dashscope');
  await expect(
    generateWithFailover([a, b, c], { prompt: 'cat' }, baseOpts),
  ).rejects.toThrow();
  expect(c.calls).toBe(0); // maxDegradations=1 -> at most 2 providers tried
});

test('explicit model overrides the provider default', async () => {
  const provider = makeProvider('openai');
  const result = await generateWithFailover(
    [provider],
    { prompt: 'cat', model: 'gpt-image-2' },
    baseOpts,
  );
  expect(result.model).toBe('gpt-image-2');
  expect(result.attempts[0]?.model).toBe('gpt-image-2');
});

test('adapter errors for missing models are recorded and rethrown', async () => {
  const noModel: ImageProvider = {
    id: 'openrouter',
    models: [],
    async generate() {
      throw new ImageGenError(
        'non-retryable',
        'openrouter: no default model configured, pass model explicitly',
      );
    },
  };
  await expect(
    generateWithFailover([noModel], { prompt: 'cat' }, baseOpts),
  ).rejects.toThrow(/no default model configured/);
});
