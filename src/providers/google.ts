import { GoogleGenAI } from '@google/genai';
import { ImageGenError, toImageGenError } from '../core/errors';
import type {
  GenerateParams,
  GenerateResult,
  ImageProvider,
} from '../core/types';

export interface GoogleGenaiOptions {
  apiKey: string;
  defaultModel?: string;
  /** Dependency injection, for tests; a real client is created when omitted. */
  client?: GoogleGenAI;
}

/**
 * Google official SDK (@google/genai) adapter:
 * - gemini image models (gemini-2.5-flash-image etc.) -> generateContent + responseModalities
 * - imagen models -> models.generateImages
 * baseUrl does not apply (managed by the official SDK); a configured baseUrl is ignored.
 */
export class GoogleGenaiProvider implements ImageProvider {
  readonly id = 'google';
  readonly models: string[];
  readonly defaultModel?: string;
  private readonly client: GoogleGenAI;

  constructor(
    opts: GoogleGenaiOptions,
    models: string[] = ['gemini-2.5-flash-image', 'imagen-4.0-generate-001'],
  ) {
    this.models = models;
    this.defaultModel = opts.defaultModel;
    this.client = opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const model = params.model ?? this.defaultModel;
    if (model === undefined) {
      throw new ImageGenError(
        'non-retryable',
        'google: no default model configured, pass model explicitly',
      );
    }

    try {
      return model.startsWith('imagen')
        ? await this.generateImagen(model, params)
        : await this.generateGemini(model, params);
    } catch (error) {
      throw toImageGenError(error);
    }
  }

  private async generateGemini(
    model: string,
    params: GenerateParams,
  ): Promise<GenerateResult> {
    const response = await this.client.models.generateContent({
      model,
      contents: params.prompt,
      config: {
        responseModalities: ['IMAGE'],
        ...(params.size !== undefined
          ? { aspectRatio: toAspectRatio(params.size) }
          : {}),
      },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const images = parts.flatMap((part) => {
      const data = part.inlineData?.data;
      return data === undefined
        ? []
        : [
            {
              data,
              format: 'base64' as const,
              mimeType: part.inlineData?.mimeType ?? 'image/png',
            },
          ];
    });
    if (images.length === 0) {
      throw new ImageGenError(
        'retryable',
        'google: response contained no image data',
      );
    }
    return { images };
  }

  private async generateImagen(
    model: string,
    params: GenerateParams,
  ): Promise<GenerateResult> {
    const response = await this.client.models.generateImages({
      model,
      prompt: params.prompt,
      config: {
        ...(params.n !== undefined ? { numberOfImages: params.n } : {}),
        ...(params.size !== undefined
          ? { aspectRatio: toAspectRatio(params.size) }
          : {}),
      },
    });
    const generated = response.generatedImages ?? [];
    const images = generated.flatMap((item) => {
      const data = item.image?.imageBytes;
      return data === undefined
        ? []
        : [
            {
              data,
              format: 'base64' as const,
              mimeType: item.image?.mimeType ?? 'image/png',
            },
          ];
    });
    if (images.length === 0) {
      throw new ImageGenError(
        'retryable',
        'google: response contained no image data',
      );
    }
    return { images };
  }
}

/** '1024x1024' -> '1:1'; unknown sizes return undefined (ignored). */
export function toAspectRatio(size: string): string | undefined {
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (match === null) return undefined;
  const ratio = Number(match[1]) / Number(match[2]);
  const rounded = Math.round(ratio * 100) / 100;
  const table: Record<number, string> = {
    1: '1:1',
    0.75: '3:4',
    1.33: '4:3',
    0.56: '9:16',
    1.78: '16:9',
    0.5: '1:2',
    2: '2:1',
  };
  return table[rounded];
}
