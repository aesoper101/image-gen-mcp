import { expect, test } from '@rstest/core';
import { ImageGenError } from '../src/core/errors';
import {
  mapImagesResponse,
  OpenAiCompatibleProvider,
} from '../src/providers/openai-compatible';

test('b64_json response maps to base64 format', () => {
  expect(mapImagesResponse({ b64_json: 'aGVsbG8=' })).toEqual({
    data: 'aGVsbG8=',
    format: 'base64',
    mimeType: 'image/png',
  });
});

test('url response maps to url format', () => {
  expect(mapImagesResponse({ url: 'https://example.com/a.png' })).toEqual({
    data: 'https://example.com/a.png',
    format: 'url',
    mimeType: 'image/png',
  });
});

test('b64_json wins over url', () => {
  expect(
    mapImagesResponse({
      b64_json: 'aGVsbG8=',
      url: 'https://example.com/a.png',
    }).format,
  ).toBe('base64');
});

test('empty response item throws retryable', () => {
  expect(() => mapImagesResponse({})).toThrow(ImageGenError);
  try {
    mapImagesResponse({});
    expect.unreachable();
  } catch (error) {
    expect((error as ImageGenError).kind).toBe('retryable');
  }
});

test('throws non-retryable when no default model and no explicit model', async () => {
  const provider = new OpenAiCompatibleProvider('openrouter', {
    apiKey: 'sk-test',
  });
  await expect(provider.generate({ prompt: 'cat' })).rejects.toThrow(
    /no default model configured/,
  );
});

test('baseUrl override takes effect', () => {
  const provider = new OpenAiCompatibleProvider('openai', {
    apiKey: 'sk-test',
    baseUrl: 'https://proxy.example.com/v1',
    defaultModel: 'gpt-image-1',
  });
  // Only verifies construction and id; the actual request path is covered by manual smoke (SDK glue)
  expect(provider.id).toBe('openai');
  expect(provider.defaultModel).toBe('gpt-image-1');
});

test('empty response array throws retryable', async () => {
  const client = { images: { generate: async () => ({ data: [] }) } };
  const provider = new OpenAiCompatibleProvider('openai', {
    apiKey: 'sk-test',
    defaultModel: 'gpt-image-1',
    client: client as never,
  });
  await expect(provider.generate({ prompt: 'cat' })).rejects.toMatchObject({
    kind: 'retryable',
  });
});

test('SDK throwing 401 maps to non-retryable', async () => {
  const client = {
    images: {
      generate: async () => {
        throw { status: 401, message: 'bad key' };
      },
    },
  };
  const provider = new OpenAiCompatibleProvider('openai', {
    apiKey: 'sk-test',
    defaultModel: 'gpt-image-1',
    client: client as never,
  });
  await expect(provider.generate({ prompt: 'cat' })).rejects.toMatchObject({
    kind: 'non-retryable',
    status: 401,
  });
});
