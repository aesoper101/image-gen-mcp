/** Retryable: network errors, timeouts, 429/5xx. Non-retryable: 401/400-style auth and param errors. */
export type ImageGenErrorKind = 'retryable' | 'non-retryable';

/** Provider call failure, thrown by adapters; the orchestrator decides retry vs. failover. */
export class ImageGenError extends Error {
  readonly kind: ImageGenErrorKind;
  /** HTTP status code; undefined for non-HTTP failures (network/timeout). */
  readonly status?: number;
  /** Original error, for logging (message already stripped of sensitive info). */
  readonly cause?: unknown;

  constructor(
    kind: ImageGenErrorKind,
    message: string,
    opts: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ImageGenError';
    this.kind = kind;
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

/** Normalize any unknown error into an ImageGenError; unknown errors conservatively become retryable. */
export function toImageGenError(error: unknown): ImageGenError {
  if (error instanceof ImageGenError) return error;

  const status = getHttpStatus(error);
  if (status !== undefined) {
    return new ImageGenError(
      isRetryableStatus(status) ? 'retryable' : 'non-retryable',
      getMessage(error),
      {
        status,
        cause: error,
      },
    );
  }
  if (isNetworkError(error)) {
    return new ImageGenError(
      'retryable',
      `network error: ${getMessage(error)}`,
      { cause: error },
    );
  }
  return new ImageGenError('retryable', getMessage(error), { cause: error });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  if (typeof code === 'string') {
    return [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
    ].includes(code);
  }
  return false;
}

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Sanitize error messages: strip sk-xxx / Bearer xxx secret fragments so API keys never reach logs. */
export function sanitizeMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1…');
}
