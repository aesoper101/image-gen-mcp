/**
 * Provider registry: adding a provider = register here (id + default baseUrl + default model).
 * - OpenAI-compatible endpoints (openai SDK + baseUrl override) share the openai-compatible
 *   adapter with zero provider-specific code
 * - Other providers get a dedicated adapter (src/providers/<id>.ts) wired in the factory
 *
 * SDK selection priority: official SDK -> compatible SDK -> fetch. Current state:
 * - google uses the official @google/genai SDK (dedicated adapter)
 * - openai / openrouter / grok / siliconflow / volcengine use the official openai SDK
 * - zhipu / dashscope have no active official Node SDK, but their image APIs are
 *   OpenAI-compatible (compatible-SDK path, reusing the openai SDK)
 */
export interface RegistryEntry {
  id: string;
  /** OpenAI-compatible endpoint (openai SDK + baseUrl override) shares the same adapter. */
  openaiCompatible: boolean;
  defaultBaseUrl: string;
  /** undefined means no default model (e.g. openrouter / siliconflow / volcengine; must be configured or passed at call time). */
  defaultModel?: string;
}

export const REGISTRY: RegistryEntry[] = [
  {
    id: 'openai',
    openaiCompatible: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-1',
  },
  {
    id: 'openrouter',
    openaiCompatible: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'grok',
    openaiCompatible: true,
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-image',
  },
  {
    id: 'siliconflow',
    openaiCompatible: true,
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
  },
  {
    id: 'volcengine',
    openaiCompatible: true,
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    id: 'zhipu',
    openaiCompatible: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-image',
  },
  {
    id: 'dashscope',
    openaiCompatible: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'wan2.7-image',
  },
  {
    id: 'google',
    openaiCompatible: false,
    defaultBaseUrl: '',
    defaultModel: 'gemini-2.5-flash-image',
  },
];

export function findRegistryEntry(id: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.id === id);
}
