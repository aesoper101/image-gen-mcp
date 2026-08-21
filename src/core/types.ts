/** Normalized generation request parameters (provider adapter input). */
export interface GenerateParams {
  prompt: string;
  /** Model name; when omitted the adapter falls back to its default model. */
  model?: string;
  /** Size like '1024x1024'; passed through to the provider, ignored when unsupported. */
  size?: string;
  /** Number of images, default 1. */
  n?: number;
}

/** Normalized representation of a single generated image. */
export interface GeneratedImage {
  /** Base64 data (without data: prefix) or a remote URL. */
  data: string;
  format: 'base64' | 'url';
  mimeType: string;
  width?: number;
  height?: number;
}

/** Provider adapter output. */
export interface GenerateResult {
  images: GeneratedImage[];
}

/**
 * Provider abstraction: adding a provider = implement this interface + register it.
 * Async task APIs (submit -> poll) are handled inside the adapter and exposed
 * as a single generate() call.
 */
export interface ImageProvider {
  /** Registered id like 'openai' / 'zhipu', used for config and logging. */
  readonly id: string;
  /** Models supported/verified by this adapter (for display). */
  readonly models: string[];
  /** Configured default model; when undefined callers must pass model explicitly. */
  readonly defaultModel?: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
}
