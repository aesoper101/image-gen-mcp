import OpenAI from 'openai';
import { ImageGenError, toImageGenError } from '../core/errors';
import type {
  GenerateParams,
  GenerateResult,
  ImageProvider,
} from '../core/types';

export interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  /** Per-request timeout, default 60s; retries are managed by the orchestrator, the SDK itself never retries. */
  timeoutMs?: number;
  /** Dependency injection, for tests; a real client is created when omitted. */
  client?: OpenAI;
}

/**
 * OpenAI-compatible adapter: one implementation covers every OpenAI-compatible endpoint
 * (openai / openrouter / grok / siliconflow / volcengine etc.), distinguished by baseUrl.
 */
export class OpenAiCompatibleProvider implements ImageProvider {
  readonly id: string;
  readonly models: string[];
  readonly defaultModel?: string;
  private readonly client: OpenAI;

  constructor(
    id: string,
    opts: OpenAiCompatibleOptions,
    models: string[] = [],
  ) {
    this.id = id;
    this.models = models;
    this.defaultModel = opts.defaultModel;
    this.client =
      opts.client ??
      new OpenAI({
        apiKey: opts.apiKey,
        baseURL: opts.baseUrl,
        timeout: opts.timeoutMs ?? 60_000,
        maxRetries: 0, // ponytail: retries are delegated to the orchestrator
      });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model ?? this.defaultModel;
    if (model === undefined) {
      throw new ImageGenError(
        'non-retryable',
        `${this.id}: no default model configured, pass model explicitly`,
      );
    }

    try {
      const response = await this.client.images.generate({
        model,
        prompt: params.prompt,
        n: params.n ?? 1,
        ...(params.size !== undefined ? { size: params.size } : {}),
      });
      const items = response.data ?? [];
      if (items.length === 0) {
        throw new ImageGenError(
          'retryable',
          `${this.id}: response contained no image data`,
        );
      }
      return { images: items.map(mapImagesResponse) };
    } catch (error) {
      throw toImageGenError(error);
    }
  }
}

/** Map an OpenAI-compatible image response item to a normalized GeneratedImage; empty items are retryable. */
export function mapImagesResponse(item: {
  b64_json?: string | null;
  url?: string | null;
}): {
  data: string;
  format: 'base64' | 'url';
  mimeType: string;
} {
  if (item.b64_json !== undefined && item.b64_json !== null) {
    return { data: item.b64_json, format: 'base64', mimeType: 'image/png' };
  }
  if (item.url !== undefined && item.url !== null) {
    return { data: item.url, format: 'url', mimeType: 'image/png' };
  }
  throw new ImageGenError('retryable', 'response item contained no image data');
}
