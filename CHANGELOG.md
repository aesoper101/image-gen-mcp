# @inferai/image-gen-mcp

## 1.0.0

### Minor Changes

- Initial implementation of the image generation MCP server:

  - Unified `ImageProvider` abstraction + provider registry; adding a provider means one adapter file + one registry entry
  - Providers: openai / openrouter / grok / siliconflow / volcengine (openai SDK), google (official @google/genai, Gemini image models and Imagen), zhipu / dashscope (OpenAI-compatible endpoints)
  - Priority routing + exponential-backoff retries + failover (`IMAGE_MCP_MAX_RETRIES` / `IMAGE_MCP_MAX_DEGRADATIONS`)
  - Three-layer config: default -> `IMAGE_MCP_*` env vars -> `--key=value` CLI args
  - MCP tools: `generate_image` (url / base64 / file output modes) + `list_providers`
  - stdio transport, installable via `npx @inferai/image-gen-mcp`
