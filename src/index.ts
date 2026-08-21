#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildConfig, type Config } from './config/config';
import { createProviders } from './providers';
import { createServer } from './server';

function log(message: string): void {
  // stdio mode: stdout carries only MCP protocol frames, all logs go to stderr
  console.error(`[image-gen-mcp] ${message}`);
}

function main(): void {
  let config: Config;
  try {
    config = buildConfig(process.env, process.argv.slice(2));
  } catch (error) {
    log(
      `Startup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
    return;
  }

  const providers = createProviders(config);
  log(
    `Enabled providers: ${config.providers.map((p) => `${p.id}(priority ${p.priority})`).join(', ')}`,
  );
  log(
    `maxRetries ${config.maxRetries} / maxDegradations ${config.maxDegradations} / outputMode ${config.outputMode}`,
  );

  serveStdio(() => createServer(config, providers), {
    onerror: (error) => log(`Connection error: ${error.message}`),
  });
}

main();
