import { expect, test } from '@rstest/core';
import { GoogleGenaiProvider, toAspectRatio } from '../src/providers/google';

test('toAspectRatio size mapping', () => {
  expect(toAspectRatio('1024x1024')).toBe('1:1');
  expect(toAspectRatio('768x1024')).toBe('3:4');
  expect(toAspectRatio('1024x768')).toBe('4:3');
  expect(toAspectRatio('512x1024')).toBe('1:2');
  expect(toAspectRatio('1024x512')).toBe('2:1');
  expect(toAspectRatio('foo')).toBeUndefined();
});

test('gemini branch: extracts images from generateContent inlineData', async () => {
  const generateContent = async () => ({
    candidates: [
      {
        content: {
          parts: [{ inlineData: { data: 'aGVsbG8=', mimeType: 'image/png' } }],
        },
      },
    ],
  });
  const client = { models: { generateContent, generateImages: undefined } };
  const provider = new GoogleGenaiProvider({
    apiKey: 'test',
    defaultModel: 'gemini-2.5-flash-image',
    client: client as never,
  });

  const result = await provider.generate({ prompt: 'cat' });
  expect(result.images).toEqual([
    { data: 'aGVsbG8=', format: 'base64', mimeType: 'image/png' },
  ]);
});

test('imagen branch: extracts images from generateImages imageBytes', async () => {
  const generateImages = async () => ({
    generatedImages: [
      { image: { imageBytes: 'aGk=', mimeType: 'image/jpeg' } },
    ],
  });
  const client = { models: { generateContent: undefined, generateImages } };
  const provider = new GoogleGenaiProvider({
    apiKey: 'test',
    defaultModel: 'imagen-4.0-generate-001',
    client: client as never,
  });

  const result = await provider.generate({ prompt: 'cat' });
  expect(result.images).toEqual([
    { data: 'aGk=', format: 'base64', mimeType: 'image/jpeg' },
  ]);
});

test('gemini response without image data throws retryable', async () => {
  const client = {
    models: {
      generateContent: async () => ({ candidates: [] }),
      generateImages: undefined,
    },
  };
  const provider = new GoogleGenaiProvider({
    apiKey: 'test',
    defaultModel: 'gemini-2.5-flash-image',
    client: client as never,
  });
  await expect(provider.generate({ prompt: 'cat' })).rejects.toMatchObject({
    kind: 'retryable',
  });
});

test('throws non-retryable when no default model and no explicit model', async () => {
  const provider = new GoogleGenaiProvider({ apiKey: 'test' });
  await expect(provider.generate({ prompt: 'cat' })).rejects.toThrow(
    /no default model configured/,
  );
});
