# SPEC: image-gen-mcp

Multi-provider AI image generation MCP server, providing unified image generation capability to agents that lack it (e.g. Claude Code).

- Stack: TypeScript + `@modelcontextprotocol/server`, built with rslib, managed by pnpm, tested with rstest, formatted with biome
- Package: `@inferai/image-gen-mcp` (already declared in package.json; must become publishable — `private` removed — to support npx)

---

## 1. Objective (Goal and Acceptance Criteria)

### Goal

Expose a `generate_image` tool to MCP clients; the server routes to multiple image generation providers driven by config. Calling agents never care about provider differences.

### Core Acceptance Criteria

1. **stdio mode**: `npx @inferai/image-gen-mcp` (or local `node dist/index.js`) starts, and a standard MCP client can discover and call the `generate_image` and `list_providers` tools.
2. **Multi-provider routing**: enabled providers are tried in priority order; after the preferred provider's retries are exhausted, fall back to the next until success or the failover limit.
3. **Config override chain**: every setting supports "default → env var → CLI arg" with args winning.
4. **Extensible abstraction**: adding a provider = one adapter file + one registry entry; no changes to the orchestrator or MCP layer.
5. **Transparent results**: returns structured JSON with the actual provider/model used and the full attempt log (including failover path).

### Non-Goals (first release)

- img2img (mentioned in the current package.json description, but this spec covers text2img only; the core interface reserves a param extension slot)
- Image streaming/progress callbacks; image analysis; local models (Ollama etc.)
- HTTP/SSE transports (stdio only; layering allows adding them later)

---

## 2. Capability Map (Phase 0)

| Module | Responsibility | Depends on | Build order |
|--------|----------------|------------|-------------|
| M1 `core/types` + `core/errors` | Abstraction layer: `ImageProvider` interface, request/result types, error classification (retryable / non-retryable) | — | 1 |
| M2 `config` | env + args parsing, three-layer merge, provider registry, startup validation | M1 types | 2 |
| M3 `providers/*` | Provider adapters (sync request or async submit+poll internally; unified `generate()` externally) | M1 | 3 onward, one at a time (each independently testable) |
| M4 `orchestrator` | Priority sort, retries, failover, attempt log | M1, M2 | 4 (validated first with fake providers) |
| M5 `server` + `index` | MCP server, tool schemas (zod), result serialization, file-mode download, stdio entry | M1, M2, M3, M4 | 5 |

Dependency direction: `M1 ← M2, M1 ← M3, M1+M2 ← M4, M1..M4 ← M5` (one-way, acyclic).

Build order equals dependency order: 1) core → 2) config → 3) `openai-compatible` adapter (validates the abstraction) → 4) orchestrator → 5) server (end-to-end works) → 6) remaining adapters (google / zhipu / dashscope) appended one by one.

---

## 3. Project Structure

```
src/
├── index.ts                # Entry: shebang, env+args parsing, server construction, stdio start
├── server.ts               # MCP server, tool registration, result serialization, file-mode saving
├── config/
│   ├── args.ts             # argv parsing (pure function, returns Record)
│   ├── env.ts              # process.env reading (pure function, returns Record)
│   └── config.ts           # three-layer merge + zod validation + provider registry (pure function)
├── core/
│   ├── types.ts            # ImageProvider interface, GenerateParams, GenerateResult, Attempt
│   └── errors.ts           # ImageGenError + isRetryable classification
├── orchestrator.ts         # retry + failover orchestration (providers injected, testable)
└── providers/
    ├── openai-compatible.ts  # official openai SDK + baseUrl override → openai / openrouter / grok / siliconflow / volcengine / zhipu / dashscope
    ├── google.ts             # official @google/genai SDK → gemini / imagen
    └── index.ts              # adapter factory (per-provider wiring)
tests/                      # rstest unit tests, one per src module
```

### Abstraction Layer (core/types.ts)

```ts
interface ImageProvider {
  readonly id: string              // registered id, e.g. 'openai' / 'zhipu'
  readonly models: string[]        // supported/verified model list
  generate(params: GenerateParams): Promise<GenerateResult>
}

interface GenerateParams {
  prompt: string
  model?: string                   // falls back to the config default when omitted
  size?: string                    // e.g. '1024x1024', passed through; ignored when unsupported
  n?: number                       // count, default 1
}

interface GenerateResult {
  images: GeneratedImage[]
}

interface GeneratedImage {
  data: string                     // base64 (no data: prefix) or remote URL
  format: 'base64' | 'url'
  mimeType: string
  width?: number
  height?: number
}
```

- Async-task APIs (zhipu, dashscope-style, Imagen) implement "submit → poll" inside the adapter and expose a single `generate()` call; the orchestrator is unaware.
- SDK selection priority (per requirements): official SDK → compatible SDK → fetch. Mapping:
  - openai / openrouter / grok / siliconflow / volcengine: official `openai` SDK with per-provider baseUrl (OpenAI-compatible protocol, i.e. the "compatible SDK" path; dependency already present)
  - google: official `@google/genai` (added dependency)
  - zhipu / dashscope: no active official Node SDK; their image APIs are OpenAI-compatible → reuse the openai SDK (compatible-SDK path)
  - Future providers without any SDK: adapter implements the API via fetch; interface unchanged

### Error Classification (core/errors.ts)

| Class | Detection | Behavior |
|-------|-----------|----------|
| retryable | network errors, timeouts, HTTP 429/5xx, async task failure | retry within the provider (exponential backoff) |
| non-retryable | HTTP 401/403/400/404 (auth or param issues) | no retry; fail the provider → failover |

### Retry/Failover Algorithm (orchestrator.ts)

```
order = enabled providers sorted by priority ascending
degradations = 0; attempts = []
for i, provider in order:
  result = tryWithRetries(provider, maxRetries)   // retries internally, throws ImageGenError on failure
  on success → return { result, attempts }
  on failure → attempts.push(...); if degradations < maxDegradations and a next provider exists → degradations++, continue
total failure → throw a final error whose message contains the full attempt summary (never API keys)
```

- `maxRetries = 0`: each provider is requested once; `maxDegradations = 0`: only the highest-priority provider.
- The attempt log `attempts: [{ provider, model, status: 'success' | 'failed', error? }]` is returned with a successful result.

---

## 4. Commands and Configuration

### Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | rslib watch build |
| `pnpm build` | rslib build to dist |
| `pnpm test` | rstest test run |
| `pnpm check` / `pnpm format` | biome check/format |
| `node dist/index.js` | local stdio start |

### Publishing (npx support, at release time)

- package.json: remove `"private": true`, add `"bin": { "image-gen-mcp": "./dist/index.js" }`
- `dist/index.js` must carry a `#!/usr/bin/env node` shebang (injected by rslib or declared at the top of the entry file)
- Existing changeset flow (`pnpm release`)

### Settings (three-layer override: default → `IMAGE_MCP_*` env vars → `--key=value` args)

| Setting | Env var | args | Default |
|---------|---------|------|---------|
| Enabled provider list (order = default priority) | `IMAGE_MCP_PROVIDERS` (comma-separated) | `--providers=...` | empty (at least one required or startup fails) |
| Provider API key | `IMAGE_MCP_<ID>_API_KEY` | `--<id>-api-key=...` | none (provider without a key is disabled) |
| Provider baseUrl | `IMAGE_MCP_<ID>_BASE_URL` | `--<id>-base-url=...` | official default per provider |
| Provider default model | `IMAGE_MCP_<ID>_MODEL` | `--<id>-model=...` | per-provider default (set against official docs at first implementation) |
| Provider priority | `IMAGE_MCP_<ID>_PRIORITY` | `--<id>-priority=...` | `PROVIDERS` list order; lower number wins |
| Max retries | `IMAGE_MCP_MAX_RETRIES` | `--max-retries=...` | 2 |
| Max failovers | `IMAGE_MCP_MAX_DEGRADATIONS` | `--max-degradations=...` | 1 |
| Retry backoff base ms | `IMAGE_MCP_RETRY_BACKOFF_MS` | `--retry-backoff-ms=...` | 1000 |
| Request timeout ms | `IMAGE_MCP_REQUEST_TIMEOUT_MS` | `--request-timeout-ms=...` | 60000 |
| Output mode | `IMAGE_MCP_OUTPUT_MODE` | `--output-mode=...` | `url` |
| file-mode directory | `IMAGE_MCP_OUTPUT_DIR` | `--output-dir=...` | `./output` |

- `<ID>` is the provider id in uppercase (e.g. `OPENAI`, `ZHIPU`).
- Args parsing: hand-written `--key=value` / `--key value` loop, no CLI framework (ponytail: a few lines).
- Startup validation: no usable provider → startup fails with a clear error; invalid setting (e.g. non-numeric priority) → startup fails naming the variable.

### MCP Tools

**`generate_image`** (zod schema validation; all params optional except prompt)

```
prompt: string (required)
provider?: string    # explicit provider id (must be enabled)
model?: string       # overrides the provider default model
size?: string        # e.g. '1024x1024'
n?: number           # 1..4, default 1
outputMode?: 'url' | 'base64' | 'file'   # overrides the global config
```

Returns (JSON string):

```json
{
  "provider": "openai",
  "model": "gpt-image-1",
  "images": [
    { "format": "url", "data": "https://...", "mimeType": "image/png", "width": 1024, "height": 1024 }
  ],
  "attempts": [
    { "provider": "zhipu", "model": "cogview-4-flash", "status": "failed", "error": "401 ..." },
    { "provider": "openai", "model": "gpt-image-1", "status": "success" }
  ]
}
```

- Provider-returned base64 → processed per `outputMode`: base64 (returned as-is, `format: 'base64'`), url (provider URL; data URI when the provider only returns base64), file (decoded into `outputDir`, file name `{provider}-{model}-{ts}.{ext}`, returns `format: 'file'` + path + local file:// link).
- On failure no partial result is returned; the MCP tool error message includes the attempt summary.

**`list_providers`** (read-only, no key needed)

Returns enabled providers: `[{ id, model (default), baseUrl (no key), priority }]`, helping agents decide whether to specify a provider explicitly.

---

## 5. Code Style

Follows the user's global rules (common + typescript layers):

- ESM, strict TS (existing tsconfig base); explicit types on public APIs; avoid `any`; external input via `unknown` + zod
- Immutable style: config merges and attempt appends return new objects, never mutate in place
- Small files, single responsibility: adapters < 200 lines; explicit error handling, never swallowed
- No `console.log` (global rule); startup/error output goes to `stderr`, stdout carries only MCP protocol (hard requirement of stdio mode)
- Naming: provider registry ids are lowercase words (`openai` / `openrouter` / `grok` / `google` / `zhipu` / `dashscope` / `volcengine` / `siliconflow`); env vars `IMAGE_MCP_<ID>_*`
- biome is the single format/lint entry point (`pnpm check`)

---

## 6. Testing Strategy

rstest (project configured with `@rstest/adapter-rslib` + coverage-v8), 80%+ coverage target. Layers:

| Layer | What | How |
|-------|------|-----|
| config unit | three-layer precedence, priority sort, disabled-without-key, invalid values error | pure functions, direct calls, no mocks |
| orchestrator unit (focus) | success stops; retries N times; failover after retries exhausted; maxDegradations=0 uses only the first; total failure throws with complete attempts; retryable retries / non-retryable fails over immediately; backoff timing | injected fake provider array (controllable success/failure/throw), fake timers for backoff |
| provider unit | request construction and response parsing; submit→poll for async-task adapters (success/task-failure/timeout); base64 and url returns | mocked SDKs (vi.mock) or injected HTTP client; fake timers drive polling |
| server smoke | `list_providers` callable without keys; `generate_image` schema-errors on missing prompt; file mode writes inside outputDir | instantiate the server and call handlers directly |

- Integration tests (real API keys): not part of the suite; README documents manual smoke commands.
- Critical paths must be tested: retry/failover orchestration, error classification, config merge, file-download path safety.

---

## 7. Boundaries

### Always

- API keys are only read from env / args, never written into code, config files, or logs; stripped from error messages and attempt summaries
- stdout emits only MCP protocol frames; all logs go to stderr (hard requirement of stdio mode)
- file-mode path validation: file names are program-generated, target directory locked inside `outputDir`, path traversal prevented
- Tool inputs validated via zod schemas (boundary validation, fail fast)
- Request timeouts: all provider requests bounded by `requestTimeoutMs` (async polling subject to the same total timeout)

### Ask First

- Adding a provider adapter (confirm official SDK availability before introducing a new SDK dependency)
- Changing any provider's default model name (set against official docs at first implementation; later changes need confirmation)
- Publishing the npm package (`pnpm release`)

### Not Doing (YAGNI)

- img2img / image editing, local models, streaming, non-stdio transports, config hot reload, concurrent generation queues
- No generic provider-agnostic fetch adapter (implement per-provider fetch only when a provider has no SDK)

---

## 8. Milestones (Implementation Order)

1. **M1+M2**: core types/errors + config parsing/merge (with tests) → done: config three-layer tests green
2. **M3 openai-compatible + M4**: first adapter + orchestrator (with tests) → done: all orchestrator branches green
3. **M5**: server + stdio entry → done: smoke tests + manual `list_providers` callable
4. **M3 rest**: google / zhipu / dashscope adapters (one at a time, each with tests) → done
5. **Release prep**: bin/shebang/README rewrite/.env.example filled, changeset → done
