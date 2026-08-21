import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Config } from './config/config';
import { ImageGenError } from './core/errors';
import type { GeneratedImage, ImageProvider } from './core/types';
import { generateWithFailover } from './orchestrator';

/** Provider output after the output-mode transform (format gains 'file'). */
type OutputImage = Omit<GeneratedImage, 'format'> & {
  format: 'url' | 'base64' | 'file';
  filePath?: string;
};

const generateInputSchema = z.object({
  prompt: z.string().min(1).describe('Image content description'),
  provider: z
    .string()
    .optional()
    .describe(
      'Explicit provider id (must be enabled); defaults to automatic priority routing',
    ),
  model: z
    .string()
    .optional()
    .describe('Model name, overrides the provider default model'),
  size: z
    .string()
    .optional()
    .describe('Size like 1024x1024, passed through to the provider'),
  n: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('Number of images, default 1'),
  outputMode: z
    .enum(['url', 'base64', 'file'])
    .optional()
    .describe('Overrides the global output mode'),
});

type GenerateInput = z.infer<typeof generateInputSchema>;

interface ToolContext {
  config: Config;
  providers: ImageProvider[];
}

export function createServer(
  config: Config,
  providers: ImageProvider[],
): McpServer {
  const server = new McpServer(
    { name: 'image-gen-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  const ctx: ToolContext = { config, providers };

  server.registerTool(
    'generate_image',
    {
      title: 'Generate Image',
      description:
        'Generate an image using configured providers (automatic retry and failover by priority); returns url / base64 / local file path',
      inputSchema: generateInputSchema,
    },
    async (args: GenerateInput) => handleGenerate(ctx, args),
  );

  server.registerTool(
    'list_providers',
    {
      title: 'List Providers',
      description:
        'List enabled image generation providers, default models, and priorities',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        { type: 'text', text: JSON.stringify(providersInfo(config), null, 2) },
      ],
      structuredContent: providersInfo(config),
    }),
  );

  return server;
}

/** Generate an image: priority routing -> retry/failover -> output-mode transform. */
export async function handleGenerate(
  ctx: ToolContext,
  args: GenerateInput,
): Promise<CallToolResult> {
  const selected =
    args.provider === undefined
      ? ctx.providers
      : ctx.providers.filter((p) => p.id === args.provider);
  if (selected.length === 0) {
    throw new ImageGenError(
      'non-retryable',
      `Provider "${args.provider}" is not enabled or does not exist (available: ${ctx.providers.map((p) => p.id).join(', ')})`,
    );
  }

  const { config } = ctx;
  const result = await generateWithFailover(
    selected,
    {
      prompt: args.prompt,
      model: args.model,
      size: args.size,
      n: args.n,
    },
    {
      maxRetries: config.maxRetries,
      maxDegradations: config.maxDegradations,
      retryBackoffMs: config.retryBackoffMs,
    },
  );

  const mode = args.outputMode ?? config.outputMode;
  const images = await Promise.all(
    result.images.map((image) => applyOutputMode(image, mode, config)),
  );

  const payload = {
    provider: result.provider,
    model: result.model,
    images,
    attempts: result.attempts,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

/** Transform per output mode: url passes through (data URI when no url); base64 as-is; file saves to disk. */
export async function applyOutputMode(
  image: GeneratedImage,
  mode: Config['outputMode'],
  config: Config,
): Promise<OutputImage> {
  if (mode === 'file') {
    return saveImage(image, config.outputDir);
  }
  if (mode === 'base64') return image;
  // url mode: base64 results become data URIs so agents can embed them directly
  if (image.format === 'base64') {
    return {
      ...image,
      format: 'url',
      data: `data:${image.mimeType};base64,${image.data}`,
    };
  }
  return image;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Save an image to disk: base64 is decoded directly, URLs are downloaded; file names are generated, directory locked to outputDir. */
export async function saveImage(
  image: GeneratedImage,
  outputDir: string,
): Promise<OutputImage & { filePath: string }> {
  const ext = EXT_BY_MIME[image.mimeType] ?? 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = path.join(outputDir, fileName);

  try {
    await mkdir(outputDir, { recursive: true });
    if (image.format === 'base64') {
      await writeFile(filePath, Buffer.from(image.data, 'base64'));
    } else {
      const response = await fetch(image.data, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new ImageGenError(
          'non-retryable',
          `Failed to download image: HTTP ${response.status}`,
        );
      }
      await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    }
  } catch (error) {
    throw new ImageGenError(
      'non-retryable',
      `Failed to save image: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return { ...image, format: 'file', data: filePath, filePath };
}

function providersInfo(config: Config) {
  return config.providers.map((p) => ({
    id: p.id,
    model: p.model ?? null,
    baseUrl: p.baseUrl,
    priority: p.priority,
  }));
}
