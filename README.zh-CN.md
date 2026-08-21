# image-gen-mcp

[English](README.md) | 中文

多供应商 AI 图片生成 MCP 服务器,为不支持图片生成的 agents(如 Claude Code)提供统一图片生成能力。

- **统一抽象**:`ImageProvider` 接口,新增供应商 = 新增适配器 + 注册表登记一行
- **多供应商容错**:按优先级路由,重试耗尽自动降级到下一个供应商,直到成功或达到最大降级次数
- **三层配置**:默认值 → 环境变量 → CLI args(args 优先)
- **适配策略**(按优先级):官方 SDK → 兼容 SDK → fetch。当前:
  - `google` — 官方 [@google/genai](https://www.npmjs.com/package/@google/genai) SDK(Gemini 图片模型 / Imagen)
  - `openai` / `openrouter` / `grok` / `siliconflow` / `volcengine` — 官方 `openai` SDK
  - `zhipu`(CogView)/ `dashscope`(通义万相) — 官方无活跃 Node SDK,但图片 API 为 OpenAI 兼容格式,复用 `openai` SDK(兼容 SDK 路径)
- **输出模式**:`url` / `base64` / `file`(本地落盘),可全局配置或按调用覆盖
- **传输**:stdio 模式,支持 `npx` 安装

## 快速开始

```bash
# 发布后
npx @inferai/image-gen-mcp

# 本地开发
pnpm install && pnpm build
node dist/index.js
```

MCP 客户端配置示例(Claude Code `~/.claude.json` / 桌面端):

```json
{
  "mcpServers": {
    "image-gen": {
      "command": "npx",
      "args": ["@inferai/image-gen-mcp"],
      "env": {
        "IMAGE_MCP_PROVIDERS": "openai,zhipu",
        "IMAGE_MCP_OPENAI_API_KEY": "sk-...",
        "IMAGE_MCP_ZHIPU_API_KEY": "..."
      }
    }
  }
}
```

## 配置

所有配置三层覆盖:**默认值 → `IMAGE_MCP_*` 环境变量 → `--key=value` args**。

### 全局

| 配置 | 环境变量 | args | 默认 |
|------|----------|------|------|
| 供应商列表(顺序即默认优先级) | `IMAGE_MCP_PROVIDERS` | `--providers` | 自动发现已配置 key 的供应商 |
| 最大重试次数(单供应商内) | `IMAGE_MCP_MAX_RETRIES` | `--max-retries` | `2` |
| 最大降级次数 | `IMAGE_MCP_MAX_DEGRADATIONS` | `--max-degradations` | `1` |
| 重试退避基数(ms,指数递增) | `IMAGE_MCP_RETRY_BACKOFF_MS` | `--retry-backoff-ms` | `1000` |
| 请求超时(ms) | `IMAGE_MCP_REQUEST_TIMEOUT_MS` | `--request-timeout-ms` | `60000` |
| 输出模式 | `IMAGE_MCP_OUTPUT_MODE` | `--output-mode` | `url` |
| file 模式保存目录 | `IMAGE_MCP_OUTPUT_DIR` | `--output-dir` | `./output` |

### 供应商(`<ID>` 见下表)

| 环境变量 | args | 说明 |
|----------|------|------|
| `IMAGE_MCP_<ID>_API_KEY` | `--<id>-api-key` | 必填(未配置则该供应商禁用) |
| `IMAGE_MCP_<ID>_BASE_URL` | `--<id>-base-url` | 覆盖默认端点 |
| `IMAGE_MCP_<ID>_MODEL` | `--<id>-model` | 覆盖默认模型 |
| `IMAGE_MCP_<ID>_PRIORITY` | `--<id>-priority` | 数字小者优先;缺省按列表顺序 |

| ID | 默认端点 | 默认模型 | 说明 |
|----|----------|----------|------|
| `openai` | `https://api.openai.com/v1` | `gpt-image-1` | OpenAI 官方 |
| `openrouter` | `https://openrouter.ai/api/v1` | 无(调用时必须传 `model`) | 聚合平台,模型名如 `openai/gpt-image-1` |
| `grok` | `https://api.x.ai/v1` | `grok-2-image` | xAI |
| `siliconflow` | `https://api.siliconflow.cn/v1` | 无(调用时必须传 `model`) | 硅基流动 |
| `volcengine` | `https://ark.cn-beijing.volces.com/api/v3` | 无(调用时必须传 `model`,即方舟 endpoint id) | 字节火山方舟(豆包 Seedream 等) |
| `zhipu` | `https://open.bigmodel.cn/api/paas/v4` | `cogview-4-flash` | 智谱 CogView |
| `dashscope` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `wan2.7-image` | 阿里通义万相 |
| `google` | —(SDK 管理) | `gemini-2.5-flash-image` | Google Gemini / Imagen |

示例(环境变量):

```bash
export IMAGE_MCP_PROVIDERS=openai,zhipu,google
export IMAGE_MCP_OPENAI_API_KEY=sk-...
export IMAGE_MCP_ZHIPU_API_KEY=...
export IMAGE_MCP_GOOGLE_API_KEY=...
export IMAGE_MCP_MAX_RETRIES=3
export IMAGE_MCP_MAX_DEGRADATIONS=2
```

示例(args 覆盖):

```bash
npx @inferai/image-gen-mcp \
  --providers=openai,zhipu \
  --openai-api-key=sk-... \
  --zhipu-api-key=... \
  --max-retries=0 \
  --max-degradations=1 \
  --output-mode=file \
  --output-dir=./images
```

## MCP 工具

### `generate_image`

| 参数 | 必填 | 说明 |
|------|------|------|
| `prompt` | ✓ | 图片内容描述 |
| `provider` | | 显式指定供应商(须已启用);缺省按优先级自动路由 |
| `model` | | 覆盖供应商默认模型(无默认模型的供应商必须传) |
| `size` | | 如 `1024x1024`,透传给供应商 |
| `n` | | 1–4,生成数量 |
| `outputMode` | | `url` / `base64` / `file`,覆盖全局配置 |

返回 JSON,含实际使用的 provider/model 与完整降级尝试记录:

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

- `file` 模式:图片写入 `IMAGE_MCP_OUTPUT_DIR`,返回本地绝对路径
- `url` 模式:供应商返回 base64 时自动转 `data:` URI

### `list_providers`

列出已启用供应商(id / 默认模型 / 端点 / 优先级),无需任何 key。

## 重试与降级语义

```
按 priority 升序尝试;供应商内:retryable(网络/超时/429/5xx)指数退避重试 maxRetries 次,
non-retryable(401/400 等)不重试直接判失败;供应商失败后降级到下一个,
最多降级 maxDegradations 次;全部失败返回含全部尝试摘要的错误。
```

- `max-retries=0`:每供应商只请求一次
- `max-degradations=0`:只用最高优先级供应商
- 错误消息与尝试记录中的 API key 一律脱敏

## 开发

```bash
pnpm install
pnpm dev        # rslib watch
pnpm test       # rstest 单元测试
pnpm check      # biome 格式化 + lint
pnpm build      # 构建 dist
node scripts/smoke.mjs   # stdio 端到端冒烟(需配置 key)
```

集成测试需真实 API key,未纳入测试套件;可用以下命令手动验证:

```bash
IMAGE_MCP_OPENAI_API_KEY=sk-... node dist/index.js   # 启动后由 MCP 客户端调用
```

调试用 MCP Inspector:

```bash
pnpm dlx @modelcontextprotocol/inspector node dist/index.js --xxx-api-key=xxx --xxx2-api-key=xxx
```

## 发布

发布已自动化(`.github/workflows/publish.yml`,changesets/action select-mode 流程):推送 main 自动开版本 PR,合并后自动发布到 npm。

```bash
pnpm changeset   # 记录变更(唯一手动步骤),合并 PR 到 main
```

`pnpm release` 作为手动兜底。CI 在每个 PR 上跑 `check` + `test` + `build`;本地 git 钩子(simple-git-hooks)pre-commit 跑 `pnpm check`、pre-push 跑 `pnpm format`。

## License

MIT
