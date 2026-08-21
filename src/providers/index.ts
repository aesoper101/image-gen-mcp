import type { Config } from '../config/config';
import type { ImageProvider } from '../core/types';
import { GoogleGenaiProvider } from './google';
import { OpenAiCompatibleProvider } from './openai-compatible';

/** Instantiate provider adapters from config; new adapters are wired here. */
export function createProviders(config: Config): ImageProvider[] {
  return config.providers.map((p) => {
    switch (p.id) {
      case 'google':
        return new GoogleGenaiProvider({
          apiKey: p.apiKey ?? '',
          defaultModel: p.model,
        });
      default:
        return new OpenAiCompatibleProvider(p.id, {
          apiKey: p.apiKey ?? '',
          baseUrl: p.baseUrl,
          defaultModel: p.model,
          timeoutMs: config.requestTimeoutMs,
        });
    }
  });
}
