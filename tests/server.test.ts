import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@rstest/core';
import { buildConfig } from '../src/config/config';
import type { ImageProvider } from '../src/core/types';
import { applyOutputMode, handleGenerate, saveImage } from '../src/server';

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'image-gen-mcp-test-'));
}

test('saveImage: base64 image written into outputDir with path returned', async () => {
  const dir = await tempDir();
  try {
    const saved = await saveImage(
      {
        data: Buffer.from('hello').toString('base64'),
        format: 'base64',
        mimeType: 'image/png',
      },
      dir,
    );
    expect(saved.format).toBe('file');
    expect(saved.filePath).toMatch(
      new RegExp(`^${dir.replace(/\\/g, '\\\\')}`),
    );
    expect(await readFile(saved.filePath, 'utf8')).toBe('hello');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveImage: unknown mime falls back to bin extension', async () => {
  const dir = await tempDir();
  try {
    const saved = await saveImage(
      { data: 'eA==', format: 'base64', mimeType: 'application/octet-stream' },
      dir,
    );
    expect(saved.filePath).toMatch(/\.bin$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveImage: url image is downloaded into outputDir', async () => {
  const dir = await tempDir();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode('url-downloaded').buffer,
    })) as never;
    const saved = await saveImage(
      {
        data: 'https://example.com/a.png',
        format: 'url',
        mimeType: 'image/png',
      },
      dir,
    );
    expect(await readFile(saved.filePath, 'utf8')).toBe('url-downloaded');
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveImage: url download failure throws non-retryable', async () => {
  const dir = await tempDir();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({ ok: false, status: 502 })) as never;
    await expect(
      saveImage(
        {
          data: 'https://example.com/a.png',
          format: 'url',
          mimeType: 'image/png',
        },
        dir,
      ),
    ).rejects.toMatchObject({ kind: 'non-retryable' });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('applyOutputMode: base64 result becomes data URI in url mode', async () => {
  const image = {
    data: 'aGk=',
    format: 'base64' as const,
    mimeType: 'image/png',
  };
  const out = await applyOutputMode(
    image,
    'url',
    buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk' }, []),
  );
  expect(out.data).toBe('data:image/png;base64,aGk=');
});

test('applyOutputMode: url result passes through unchanged', async () => {
  const image = {
    data: 'https://example.com/a.png',
    format: 'url' as const,
    mimeType: 'image/png',
  };
  const out = await applyOutputMode(
    image,
    'url',
    buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk' }, []),
  );
  expect(out.data).toBe('https://example.com/a.png');
});

test('applyOutputMode: base64 mode returns as-is', async () => {
  const image = {
    data: 'aGk=',
    format: 'base64' as const,
    mimeType: 'image/png',
  };
  const out = await applyOutputMode(
    image,
    'base64',
    buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk' }, []),
  );
  expect(out).toEqual(image);
});

test('applyOutputMode: file mode saves to disk', async () => {
  const dir = await tempDir();
  try {
    const image = {
      data: Buffer.from('png').toString('base64'),
      format: 'base64' as const,
      mimeType: 'image/png',
    };
    const out = await applyOutputMode(
      image,
      'file',
      buildConfig(
        { IMAGE_MCP_OPENAI_API_KEY: 'sk', IMAGE_MCP_OUTPUT_DIR: dir },
        [],
      ),
    );
    expect(out.format).toBe('file');
    expect(out.filePath).toBeDefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('handleGenerate: unenabled provider errors listing available ones', async () => {
  const config = buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk' }, []);
  await expect(
    handleGenerate(
      { config, providers: [] },
      { prompt: 'cat', provider: 'zhipu' },
    ),
  ).rejects.toThrow(/not enabled or does not exist/);
});

test('handleGenerate: explicit provider filter takes effect', async () => {
  const config = buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk' }, []);
  const providers: ImageProvider[] = [
    {
      id: 'openai',
      models: [],
      async generate() {
        return {
          images: [
            {
              data: 'https://a.com/1.png',
              format: 'url',
              mimeType: 'image/png',
            },
          ],
        };
      },
    },
  ];
  const result = await handleGenerate(
    { config, providers },
    { prompt: 'cat', provider: 'openai' },
  );
  expect(result.structuredContent).toMatchObject({ provider: 'openai' });
  expect(result.content[0]?.text).toContain('"provider":"openai"');
});

test('handleGenerate: file mode returns a local path', async () => {
  const dir = await tempDir();
  try {
    const config = buildConfig(
      {
        IMAGE_MCP_OPENAI_API_KEY: 'sk',
        IMAGE_MCP_OUTPUT_MODE: 'file',
        IMAGE_MCP_OUTPUT_DIR: dir,
      },
      [],
    );
    const providers: ImageProvider[] = [
      {
        id: 'openai',
        models: [],
        async generate() {
          return {
            images: [
              {
                data: Buffer.from('pngdata').toString('base64'),
                format: 'base64',
                mimeType: 'image/png',
              },
            ],
          };
        },
      },
    ];
    const result = await handleGenerate(
      { config, providers },
      { prompt: 'cat' },
    );
    const images = result.structuredContent as {
      images: { format: string; filePath: string }[];
    };
    expect(images.images[0]?.format).toBe('file');
    expect(images.images[0]?.filePath).toContain(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
