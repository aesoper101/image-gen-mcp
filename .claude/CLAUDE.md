# image-gen-mcp

Multi-provider AI image generation MCP server (stdio). Design document: SPEC.md.

## Commands

- `pnpm build` — rslib builds dist (bin entry, includes shebang)
- `pnpm test` — rstest unit tests
- `pnpm check` — biome format + lint (auto-fixes with --write; run after edits)
- `pnpm format` — biome format --write
- `node scripts/smoke.mjs` — stdio end-to-end smoke test (requires IMAGE_MCP_*_API_KEY)
- `pnpm exec rstest --coverage` — coverage (thresholds in rstest.config.ts)
- `pnpm exec biome ...` — always via pnpm exec (pnpm-only project, pinned via `packageManager` in package.json)

## Architecture

- Extending providers: register in `src/config/registry.ts` (id/baseUrl/default model/OpenAI-compatible flag) → wire the adapter branch in `src/providers/index.ts`
- Provider SDK research findings (zhipu/dashscope have no official Node SDK, hence the OpenAI-compatible endpoints; google uses @google/genai) live in the header comment of `src/config/registry.ts` — read before extending
- `providers/openai-compatible.ts` covers all OpenAI-compatible endpoints in one implementation (openai/openrouter/grok/siliconflow/volcengine/zhipu/dashscope); `providers/google.ts` is the only dedicated adapter (@google/genai: gemini via generateContent, imagen via generateImages)
- Retry/failover orchestration lives in `orchestrator.ts`; error classification (retryable/non-retryable) in `core/errors.ts`
- Three-layer config (default → env → args) in `config/`; `IMAGE_MCP_*` prefix

## Gotchas

- **Smoke script pattern**: `scripts/smoke.mjs` hand-writes the JSON-RPC frame protocol (spawn dist/index.js + newline-delimited frames); reuse it when touching MCP protocol interaction
- **stdio hard constraint**: stdout carries only MCP protocol frames; all logs go through `console.error` (stderr)
- **biome strips `= undefined` initializers** (conflicts with TS used-before-assigned): avoid declare-then-assign; use arrays/locals instead
- **biome rewrites formatting** (semicolons, single quotes, 80 cols): don't hand-align, run `pnpm check` after writing
- **MCP SDK v2**: `structuredContent` is wrapped as `{ result: ... }` in protocol responses; tools register via `McpServer.registerTool(name, { inputSchema: z.object(...) }, cb)`
- **Tests have no vi/mock**: rstest exports no mocks; tests use constructor dependency injection (fake provider / fake client)
- **New native deps**: approve their build scripts under `allowBuilds` in `pnpm-workspace.yaml`, otherwise pnpm install fails with ERR_PNPM_IGNORED_BUILDS
- **git bash regex trap**: grep unicode ranges (U+4E00–U+9FFF escapes) get shell-escaped in git bash, matching every file; scan unicode with a Node script instead

## Environment

- API keys are only read from env vars/args, never written into code or logs (error messages are sanitized via `sanitizeMessage`)

## Changeset

- Publishing and versioning are fully automated via CI (`.github/workflows/publish.yml`); the only manual step is recording changes
- **Rule: whenever a user-visible change lands (bug fix / new feature), run `pnpm changeset` BEFORE `git commit`**

## Docs & Language

- README is bilingual: `README.md` (English, primary) + `README.zh-CN.md` (Chinese), linked at the top; update both on any doc change (both ship in `files`)
- Source code, comments, SPEC.md and CLAUDE.md are English; `README.zh-CN.md` is the only Chinese file in the project
