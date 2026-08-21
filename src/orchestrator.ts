import { ImageGenError, sanitizeMessage, toImageGenError } from './core/errors';
import type {
  GenerateParams,
  GenerateResult,
  ImageProvider,
} from './core/types';

/** Single attempt record, returned with the result so callers see the full failover path. */
export interface Attempt {
  provider: string;
  model: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface OrchestratedResult {
  provider: string;
  model: string;
  images: GenerateResult['images'];
  attempts: Attempt[];
}

export interface OrchestratorOptions {
  /** Max retries within a single provider (0 = try once). */
  maxRetries: number;
  /** Max failovers (0 = only the highest-priority provider). */
  maxDegradations: number;
  /** Retry backoff base ms; actual wait = backoff * 2^attempt. */
  retryBackoffMs: number;
  /** Dependency injection, for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Priority routing + retry + failover:
 * tries providers in priority order; retryable errors are retried maxRetries times within a
 * provider, non-retryable errors fail it immediately; on provider failure fall back to the
 * next provider, up to maxDegradations times; total failure throws a final error with the
 * attempt summary.
 */
export async function generateWithFailover(
  providers: readonly ImageProvider[],
  params: GenerateParams,
  opts: OrchestratorOptions,
): Promise<OrchestratedResult> {
  const attempts: Attempt[] = [];
  const failures: unknown[] = [];
  const limit = Math.min(providers.length, opts.maxDegradations + 1);
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (const provider of providers.slice(0, limit)) {
    const model = params.model ?? provider.defaultModel;
    try {
      const result = await retryOnce(
        provider,
        params,
        model,
        opts,
        sleep,
        attempts,
      );
      attempts.push({
        provider: provider.id,
        model: model ?? '(unspecified)',
        status: 'success',
      });
      return {
        provider: provider.id,
        model: model ?? '(unspecified)',
        images: result.images,
        attempts,
      };
    } catch (error) {
      failures.push(error);
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}/${a.model}: ${a.error ?? a.status}`)
    .join('; ');
  throw new ImageGenError(
    'non-retryable',
    `Image generation failed after ${attempts.length} provider(s): ${sanitizeMessage(summary)}`,
    {
      cause: failures.at(-1),
    },
  );
}

/** Retry within a single provider: non-retryable errors throw immediately, retryable ones back off. */
async function retryOnce(
  provider: ImageProvider,
  params: GenerateParams,
  model: string | undefined,
  opts: OrchestratorOptions,
  sleep: (ms: number) => Promise<void>,
  attempts: Attempt[],
): Promise<GenerateResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.generate(params);
    } catch (error) {
      const err = toImageGenError(error);
      attempts.push({
        provider: provider.id,
        model: model ?? '(unspecified)',
        status: 'failed',
        error: sanitizeMessage(err.message),
      });
      if (err.kind === 'non-retryable' || attempt >= opts.maxRetries) throw err;
      await sleep(opts.retryBackoffMs * 2 ** attempt);
    }
  }
}
