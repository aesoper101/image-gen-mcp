import { parseArgs } from './args';
import type { EnvSource } from './env';
import { REGISTRY } from './registry';

/** Final config for a single enabled provider. */
export interface ProviderConfig {
  id: string;
  apiKey?: string;
  baseUrl: string;
  /** When undefined, callers must pass model explicitly. */
  model?: string;
  /** Lower number wins. */
  priority: number;
}

export interface Config {
  /** Enabled providers, sorted by priority ascending. */
  providers: ProviderConfig[];
  maxRetries: number;
  maxDegradations: number;
  retryBackoffMs: number;
  requestTimeoutMs: number;
  outputMode: 'url' | 'base64' | 'file';
  outputDir: string;
}

/** Config error: thrown at startup, message names the offending variable. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const ENV_PREFIX = 'IMAGE_MCP_';

/**
 * Three-layer override: default -> environment variables -> CLI args (args win).
 * - Global: IMAGE_MCP_PROVIDERS / --providers, IMAGE_MCP_MAX_RETRIES / --max-retries, etc.
 * - Per-provider: IMAGE_MCP_<ID>_API_KEY / --<id>-api-key, ..._BASE_URL, ..._MODEL, ..._PRIORITY
 */
export function buildConfig(env: EnvSource, argv: string[]): Config {
  const args = parseArgs(argv);
  const picked = <T>(
    envKey: string,
    argKey: string,
    fallback: T,
  ): string | T => {
    const fromEnv = env[envKey];
    const fromArgs = args[argKey];
    if (fromArgs !== undefined && fromArgs !== '') return fromArgs;
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    return fallback;
  };

  const maxRetries = parseIntStrict(
    'IMAGE_MCP_MAX_RETRIES',
    'max-retries',
    picked('IMAGE_MCP_MAX_RETRIES', 'max-retries', 2),
    0,
    10,
  );
  const maxDegradations = parseIntStrict(
    'IMAGE_MCP_MAX_DEGRADATIONS',
    'max-degradations',
    picked('IMAGE_MCP_MAX_DEGRADATIONS', 'max-degradations', 1),
    0,
    10,
  );
  const retryBackoffMs = parseIntStrict(
    'IMAGE_MCP_RETRY_BACKOFF_MS',
    'retry-backoff-ms',
    picked('IMAGE_MCP_RETRY_BACKOFF_MS', 'retry-backoff-ms', 1000),
    0,
    60_000,
  );
  const requestTimeoutMs = parseIntStrict(
    'IMAGE_MCP_REQUEST_TIMEOUT_MS',
    'request-timeout-ms',
    picked('IMAGE_MCP_REQUEST_TIMEOUT_MS', 'request-timeout-ms', 60_000),
    1_000,
    600_000,
  );
  const outputMode = pickOutputMode(
    picked('IMAGE_MCP_OUTPUT_MODE', 'output-mode', 'url'),
  );
  const outputDir = String(
    picked('IMAGE_MCP_OUTPUT_DIR', 'output-dir', './output'),
  );

  const providers = buildProviders(env, args);
  if (providers.length === 0) {
    throw new ConfigError(
      'No image generation providers available: configure IMAGE_MCP_<ID>_API_KEY (or --<id>-api-key) ' +
        'for at least one provider. Available: openai, openrouter, grok, siliconflow, volcengine, google, zhipu, dashscope',
    );
  }

  return {
    providers,
    maxRetries,
    maxDegradations,
    retryBackoffMs,
    requestTimeoutMs,
    outputMode,
    outputDir,
  };
}

/**
 * Assemble enabled providers.
 * - Only providers with an apiKey are enabled; when IMAGE_MCP_PROVIDERS / --providers
 *   is set explicitly, the list filters them
 * - priority: explicit settings win; otherwise list order, then registry order for unlisted ids
 */
export function buildProviders(
  env: EnvSource,
  args: Record<string, string>,
): ProviderConfig[] {
  const listed = splitList(
    args.providers ?? env[`${ENV_PREFIX}PROVIDERS`] ?? '',
  );
  if (listed.length > 0) {
    const unknown = listed.filter((id) => !REGISTRY.some((e) => e.id === id));
    if (unknown.length > 0) {
      throw new ConfigError(
        `Unknown providers: ${unknown.join(', ')}; available: ${REGISTRY.map((e) => e.id).join(', ')}`,
      );
    }
  }

  const out: ProviderConfig[] = [];
  for (const entry of REGISTRY) {
    const read = (argKey: string, envSuffix: string): string | undefined => {
      const fromArgs = args[argKey];
      if (fromArgs !== undefined && fromArgs !== '') return fromArgs;
      const fromEnv =
        env[`${ENV_PREFIX}${entry.id.toUpperCase()}_${envSuffix}`];
      return fromEnv !== undefined && fromEnv !== '' ? fromEnv : undefined;
    };
    const apiKey = read(`${entry.id}-api-key`, 'API_KEY');
    if (apiKey === undefined) continue;

    const explicitPriority = read(`${entry.id}-priority`, 'PRIORITY');
    out.push({
      id: entry.id,
      apiKey,
      baseUrl: read(`${entry.id}-base-url`, 'BASE_URL') ?? entry.defaultBaseUrl,
      model: read(`${entry.id}-model`, 'MODEL') ?? entry.defaultModel,
      priority:
        explicitPriority !== undefined
          ? parseIntStrict(
              `IMAGE_MCP_${entry.id.toUpperCase()}_PRIORITY`,
              `${entry.id}-priority`,
              explicitPriority,
              0,
              1000,
            )
          : listed.includes(entry.id)
            ? listed.indexOf(entry.id)
            : 100 + REGISTRY.indexOf(entry),
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntStrict(
  envKey: string,
  argKey: string,
  value: string | number,
  min: number,
  max: number,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(
      `Invalid ${envKey} / --${argKey} config: "${value}" (must be an integer between ${min} and ${max})`,
    );
  }
  return n;
}

function pickOutputMode(value: string): Config['outputMode'] {
  if (value === 'url' || value === 'base64' || value === 'file') return value;
  throw new ConfigError(
    `Invalid IMAGE_MCP_OUTPUT_MODE / --output-mode: "${value}" (must be url | base64 | file)`,
  );
}
