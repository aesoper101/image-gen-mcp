# @inferai/image-gen-mcp

## 1.1.0

### Minor Changes

- [`4398cc8`](https://github.com/aesoper101/image-gen-mcp/commit/4398cc8893dda4a8f50e21a35e917ddfb84b7d93) Thanks [@aesoper101](https://github.com/aesoper101)! - Remove `IMAGE_MCP_PROVIDERS` / `--providers`: providers are now auto-discovered from configured API keys only — a provider is enabled iff `IMAGE_MCP_<ID>_API_KEY` (or `--<id>-api-key`) is set, no provider list to maintain. Default priority is the registry order (overridable per provider with `IMAGE_MCP_<ID>_PRIORITY`).
  
  README: configuration examples are now stdio MCP client setups (Claude Code / Claude Desktop) with separate Windows and Linux/macOS snippets.

## 1.0.3

### Patch Changes

- [`88c0c58`](https://github.com/aesoper101/image-gen-mcp/commit/88c0c585e389572e4ede1e0ffd0a4592ae185aa6) Thanks [@aesoper101](https://github.com/aesoper101)! - Fix the CI-published tarball missing the build output (`dist/`), which made `npx @inferai/image-gen-mcp` unusable (MCP clients reported `-32000`):
  
  `changesets/action/publish` ignores the pack artifact when a custom `script` input is set and runs that script from a checkout that never contains `dist/` (gitignored, never built there) — so `changeset publish` packed a tarball without the build output. Removed the custom `script` from the publish job so the action publishes the pack job's tarballs via `--from-pack-dir`.

## 1.0.2

### Patch Changes

- [`198c15c`](https://github.com/aesoper101/image-gen-mcp/commit/198c15cbfd74d9a1cdad92e958ecdb390b80ddb8) Thanks [@aesoper101](https://github.com/aesoper101)! - Fix the published package being unusable (`npx @inferai/image-gen-mcp` failed to start, MCP clients reported `-32000`):
  
  - Removed `devEngines.packageManager` (with `onFail: download`): npm refuses to install packages requiring pnpm with `EBADDEVENGINES`, so `npx`/`npm` consumers could never run the server. Replaced with the standard `packageManager: "pnpm@11.21.0"` field, which pins the version for CI/corepack without blocking npm installs.
  - The CI `pack` job produced tarballs missing `dist/` (gitignored output was filtered by the unpinned pnpm version in `pnpm/setup`): the `packageManager` pin makes CI use pnpm 11.21.0, whose pack includes `dist/`.

## 1.0.1

### Patch Changes

- [`ee379e1`](https://github.com/aesoper101/image-gen-mcp/commit/ee379e1bab755c865a43a6fcab45ddbdd279536c) Thanks [@aesoper101](https://github.com/aesoper101)! - Fix duplicate shebang in the built bundle (`src/index.ts` shebang + rslib banner both emitted) that made the published package crash on load:
  
  ```
  SyntaxError: Invalid or unexpected token
  ```
  
  when installed and run via `npx @inferai/image-gen-mcp`. Removed the redundant banner; the entry shebang is preserved by rslib.

## 1.0.0

### Minor Changes

- Initial implementation of the image generation MCP server:

  - Unified `ImageProvider` abstraction + provider registry; adding a provider means one adapter file + one registry entry
  - Providers: openai / openrouter / grok / siliconflow / volcengine (openai SDK), google (official @google/genai, Gemini image models and Imagen), zhipu / dashscope (OpenAI-compatible endpoints)
  - Priority routing + exponential-backoff retries + failover (`IMAGE_MCP_MAX_RETRIES` / `IMAGE_MCP_MAX_DEGRADATIONS`)
  - Three-layer config: default -> `IMAGE_MCP_*` env vars -> `--key=value` CLI args
  - MCP tools: `generate_image` (url / base64 / file output modes) + `list_providers`
  - stdio transport, installable via `npx @inferai/image-gen-mcp`
