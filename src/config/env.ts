/** Environment variable read entry point, thin wrapper for test injection. */
export type EnvSource = Record<string, string | undefined>;

export function readEnv(env: EnvSource = process.env): EnvSource {
  return env;
}
