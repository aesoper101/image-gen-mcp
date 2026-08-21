# @inferai/image-gen-mcp

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
