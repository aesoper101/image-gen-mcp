import { expect, test } from '@rstest/core';
import { buildConfig, buildProviders, ConfigError } from '../src/config/config';

test('startup fails when no provider is configured', () => {
  expect(() => buildConfig({}, [])).toThrow(ConfigError);
});

test('auto-discovers providers from env api key', () => {
  const cfg = buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk-test' }, []);
  expect(cfg.providers).toHaveLength(1);
  expect(cfg.providers[0]?.id).toBe('openai');
  expect(cfg.providers[0]?.baseUrl).toBe('https://api.openai.com/v1');
  expect(cfg.providers[0]?.model).toBe('gpt-image-1');
});

test('args override env, env overrides defaults', () => {
  const env = {
    IMAGE_MCP_OPENAI_API_KEY: 'sk-env',
    IMAGE_MCP_OPENAI_MODEL: 'gpt-image-1-mini',
  };
  const cfg = buildConfig(env, ['--openai-model=gpt-image-2']);
  expect(cfg.providers[0]?.model).toBe('gpt-image-2');
  expect(cfg.providers[0]?.apiKey).toBe('sk-env');

  const cfg2 = buildConfig(env, ['--openai-api-key=sk-args']);
  expect(cfg2.providers[0]?.apiKey).toBe('sk-args');
});

test('defaults: maxRetries=2, maxDegradations=1, outputMode=url', () => {
  const cfg = buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk-test' }, []);
  expect(cfg.maxRetries).toBe(2);
  expect(cfg.maxDegradations).toBe(1);
  expect(cfg.outputMode).toBe('url');
  expect(cfg.outputDir).toBe('./output');
});

test('global numeric settings are overridable via env / args', () => {
  const fromEnv = buildConfig(
    { IMAGE_MCP_OPENAI_API_KEY: 'sk', IMAGE_MCP_MAX_RETRIES: '5' },
    [],
  );
  expect(fromEnv.maxRetries).toBe(5);

  const fromArgs = buildConfig(
    { IMAGE_MCP_OPENAI_API_KEY: 'sk', IMAGE_MCP_MAX_RETRIES: '5' },
    ['--max-retries=0'],
  );
  expect(fromArgs.maxRetries).toBe(0);
});

test('invalid numbers throw ConfigError naming the variable', () => {
  expect(() =>
    buildConfig(
      { IMAGE_MCP_OPENAI_API_KEY: 'sk', IMAGE_MCP_MAX_RETRIES: 'abc' },
      [],
    ),
  ).toThrow(/MAX_RETRIES/);
  expect(() =>
    buildConfig({ IMAGE_MCP_OPENAI_API_KEY: 'sk' }, ['--max-degradations=-1']),
  ).toThrow(/max-degradations/);
  expect(() =>
    buildConfig(
      { IMAGE_MCP_OPENAI_API_KEY: 'sk', IMAGE_MCP_OUTPUT_MODE: 'ftp' },
      [],
    ),
  ).toThrow(/output-mode/);
});

test('providers sort by priority ascending; list order used when priority unset', () => {
  const env = {
    IMAGE_MCP_PROVIDERS: 'zhipu,openai',
    IMAGE_MCP_OPENAI_API_KEY: 'sk-1',
    IMAGE_MCP_ZHIPU_API_KEY: 'sk-2',
  };
  const cfg = buildConfig(env, []);
  expect(cfg.providers.map((p) => p.id)).toEqual(['zhipu', 'openai']);
});

test('explicit priority overrides list order', () => {
  const env = {
    IMAGE_MCP_PROVIDERS: 'zhipu,openai',
    IMAGE_MCP_OPENAI_API_KEY: 'sk-1',
    IMAGE_MCP_ZHIPU_API_KEY: 'sk-2',
    IMAGE_MCP_OPENAI_PRIORITY: '0',
  };
  const cfg = buildConfig(env, []);
  expect(cfg.providers.map((p) => p.id)).toEqual(['openai', 'zhipu']);
});

test('providers without an api key are skipped in list mode', () => {
  const env = {
    IMAGE_MCP_PROVIDERS: 'openai,google,zhipu',
    IMAGE_MCP_OPENAI_API_KEY: 'sk',
  };
  const cfg = buildConfig(env, []);
  expect(cfg.providers.map((p) => p.id)).toEqual(['openai']);
});

test('unknown providers in list mode throw', () => {
  expect(() =>
    buildConfig(
      { IMAGE_MCP_PROVIDERS: 'openai,foo', IMAGE_MCP_OPENAI_API_KEY: 'sk' },
      [],
    ),
  ).toThrow(/Unknown providers: foo/);
});

test('providers without a default model (openrouter) do not require model', () => {
  const cfg = buildConfig({ IMAGE_MCP_OPENROUTER_API_KEY: 'sk' }, []);
  expect(cfg.providers[0]?.id).toBe('openrouter');
  expect(cfg.providers[0]?.model).toBeUndefined();
});

test('buildProviders supports baseUrl override via args', () => {
  const providers = buildProviders(
    { IMAGE_MCP_OPENAI_API_KEY: 'sk' },
    { 'openai-base-url': 'https://proxy.example.com/v1' },
  );
  expect(providers[0]?.baseUrl).toBe('https://proxy.example.com/v1');
});
