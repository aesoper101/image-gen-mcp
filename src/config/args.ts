/**
 * Lightweight CLI args parser, supports `--key=value` and `--key value` forms.
 * No CLI framework (ponytail: a simple loop does it).
 */
export function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      result[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[body] = argv[++i];
    } else {
      result[body] = 'true';
    }
  }
  return result;
}
