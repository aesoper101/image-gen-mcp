# image-gen-mcp

English | [中文](README.zh-CN.md)

A multi-provider AI image generation MCP server that gives image generation capabilities to agents without them (e.g. Claude Code).

- **Unified abstraction**: `ImageProvider` interface — adding a provider = one adapter file + one registry entry
- **Multi-provider failover**: priority routing, retries, automatic fallback to the next provider until success or the max failover count
- **Three-layer config**: defaults → environment variables → CLI args (args win)
- **SDK selection** (by priority): official SDK → compatible SDK → fetch. Current state:
  - `google` — official [@google/genai](https://www.npmjs.com/package/@google/genai) SDK (Gemini image models / Imagen)
  - `openai` / `openrouter` / `grok` / `siliconflow` / `volcengine` — official `openai` SDK
  - `zhipu` (CogView) / `dashscope` (Wan) — no active official Node SDK, but their image APIs are OpenAI-compatible, reusing the `openai` SDK (compatible-SDK path)
- **Output modes**: `url` / `base64` / `file` (saved locally), configurable globally or per call
- **Transport**: stdio, installable via `npx`

## Quick Start

```bash
# After publishing
npx @inferai/image-gen-mcp

# Local development
pnpm install && pnpm build
node dist/index.js
```

Configure it as a stdio MCP server in your client. **Windows** — Claude Desktop: `%APPDATA%\Claude\claude_desktop_config.json`; Claude Code: `~/.claude.json` (`C:\Users\<user>\.claude.json`). `cmd /c` is required to resolve `npx`:

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@inferai/image-gen-mcp"],
      "env": {
        "IMAGE_MCP_OPENAI_API_KEY": "sk-...",
        "IMAGE_MCP_ZHIPU_API_KEY": "..."
      }
    }
  }
}
```

**Linux / macOS** — Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.config/Claude/claude_desktop_config.json` (Linux); Claude Code: `~/.claude.json`:

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "npx",
      "args": ["-y", "@inferai/image-gen-mcp"],
      "env": {
        "IMAGE_MCP_OPENAI_API_KEY": "sk-...",
        "IMAGE_MCP_ZHIPU_API_KEY": "..."
      }
    }
  }
}
```

Providers are **auto-discovered**: a provider is enabled iff its API key is configured — no provider list to maintain. Set `IMAGE_MCP_<ID>_API_KEY` (or `--<id>-api-key`) for exactly the providers you want.

## Configuration

All settings follow a three-layer override: **defaults → `IMAGE_MCP_*` env vars → `--key=value` args**.

### Global

| Setting | Env var | args | Default |
|---------|---------|------|---------|
| Enabled providers | — (auto-discovery) | — | Every provider with a configured API key, in registry order |
| Max retries (within one provider) | `IMAGE_MCP_MAX_RETRIES` | `--max-retries` | `2` |
| Max failovers | `IMAGE_MCP_MAX_DEGRADATIONS` | `--max-degradations` | `1` |
| Retry backoff base (ms, exponential) | `IMAGE_MCP_RETRY_BACKOFF_MS` | `--retry-backoff-ms` | `1000` |
| Request timeout (ms) | `IMAGE_MCP_REQUEST_TIMEOUT_MS` | `--request-timeout-ms` | `60000` |
| Output mode | `IMAGE_MCP_OUTPUT_MODE` | `--output-mode` | `url` |
| Directory for file mode | `IMAGE_MCP_OUTPUT_DIR` | `--output-dir` | `./output` |

### Providers (`<ID>` per table below)

| Env var | args | Notes |
|---------|------|-------|
| `IMAGE_MCP_<ID>_API_KEY` | `--<id>-api-key` | Required (provider is disabled without it) |
| `IMAGE_MCP_<ID>_BASE_URL` | `--<id>-base-url` | Overrides the default endpoint |
| `IMAGE_MCP_<ID>_MODEL` | `--<id>-model` | Overrides the default model |
| `IMAGE_MCP_<ID>_PRIORITY` | `--<id>-priority` | Lower number wins; defaults to registry order |

| ID | Default endpoint | Default model | Notes |
|----|------------------|---------------|-------|
| `openai` | `https://api.openai.com/v1` | `gpt-image-1` | OpenAI |
| `openrouter` | `https://openrouter.ai/api/v1` | none (`model` required at call time) | Aggregator; model names like `openai/gpt-image-1` |
| `grok` | `https://api.x.ai/v1` | `grok-2-image` | xAI |
| `siliconflow` | `https://api.siliconflow.cn/v1` | none (`model` required at call time) | SiliconFlow |
| `volcengine` | `https://ark.cn-beijing.volces.com/api/v3` | none (`model` = Ark endpoint id) | ByteDance Volcano Ark (Doubao Seedream etc.) |
| `zhipu` | `https://open.bigmodel.cn/api/paas/v4` | `cogview-4-flash` | Zhipu CogView |
| `dashscope` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `wan2.7-image` | Alibaba Wan |
| `google` | —(SDK-managed) | `gemini-2.5-flash-image` | Google Gemini / Imagen |

Example (env vars):

```bash
export IMAGE_MCP_OPENAI_API_KEY=sk-...
export IMAGE_MCP_ZHIPU_API_KEY=...
export IMAGE_MCP_GOOGLE_API_KEY=...
export IMAGE_MCP_MAX_RETRIES=3
export IMAGE_MCP_MAX_DEGRADATIONS=2
```

Example (args override):

```bash
npx @inferai/image-gen-mcp \
  --openai-api-key=sk-... \
  --zhipu-api-key=... \
  --max-retries=0 \
  --max-degradations=1 \
  --output-mode=file \
  --output-dir=./images
```

## MCP Tools

### `generate_image`

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | ✓ | Image content description |
| `provider` | | Explicit provider id (must be enabled); defaults to automatic priority routing |
| `model` | | Overrides the provider default model (required for providers without one) |
| `size` | | e.g. `1024x1024`, passed through to the provider |
| `n` | | 1–4, number of images |
| `outputMode` | | `url` / `base64` / `file`, overrides the global config |

Returns JSON with the actual provider/model used and the full failover attempt log:

```json
{
  "provider": "openai",
  "model": "gpt-image-1",
  "images": [{ "format": "url", "data": "https://...", "mimeType": "image/png" }],
  "attempts": [
    { "provider": "zhipu", "model": "cogview-4-flash", "status": "failed", "error": "429 rate limited" },
    { "provider": "openai", "model": "gpt-image-1", "status": "success" }
  ]
}
```

- `file` mode: images are written to `IMAGE_MCP_OUTPUT_DIR`, the local absolute path is returned
- `url` mode: base64 results are converted to `data:` URIs automatically

### `list_providers`

Lists enabled providers (id / default model / endpoint / priority); no API key required.

## Retry & Failover Semantics

```
Try providers in priority ascending order; within a provider: retryable errors
(network/timeout/429/5xx) retry with exponential backoff up to maxRetries,
non-retryable (401/400 etc.) fail it immediately; on provider failure fall back to
the next, up to maxDegradations times; total failure returns an error with the full
attempt summary.
```

- `max-retries=0`: each provider is tried once
- `max-degradations=0`: only the highest-priority provider is used
- API keys are sanitized in all error messages and attempt logs

## Development

```bash
pnpm install
pnpm dev        # rslib watch
pnpm test       # rstest unit tests
pnpm check      # biome format + lint
pnpm build      # build dist
node scripts/smoke.mjs   # stdio end-to-end smoke test (requires a configured key)
```

Integration tests need real API keys and are not part of the suite; verify manually:

```bash
IMAGE_MCP_OPENAI_API_KEY=sk-... node dist/index.js   # then call via an MCP client
```

Debugging with MCP Inspector:

```bash
pnpm dlx @modelcontextprotocol/inspector node dist/index.js --xxx-api-key=xxx --xxx2-api-key=xxx
```

## Publishing

Publishing is automated (`.github/workflows/publish.yml` with the changesets/action select-mode flow): push to `main` creates a version PR, and merging it publishes to npm automatically.

```bash
pnpm changeset   # record changes (the only manual step), then merge the PR to main
```

`pnpm release` exists as a manual fallback. CI runs `check` + `test` + `build` on every PR; local git hooks (`simple-git-hooks`) run `pnpm check` pre-commit and `pnpm format` pre-push.

## License

MIT
