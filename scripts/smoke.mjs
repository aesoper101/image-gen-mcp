// End-to-end smoke test: spawns the real dist/index.js and drives the stdio frame
// protocol to verify handshake, tool discovery, and the no-key validation path.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const child = spawn(process.execPath, [resolve(root, 'dist/index.js')], {
  env: { ...process.env, IMAGE_MCP_OPENAI_API_KEY: 'sk-smoke-test' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (d) => (stderr += d));

let buffer = '';
const pending = new Map();
let nextId = 1;
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let idx = buffer.indexOf('\n');
  while (idx !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
    idx = buffer.indexOf('\n');
  }
});

function send(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return new Promise((resolve) => pending.set(id, resolve));
}

function assert(cond, label) {
  if (!cond) {
    console.error(`✗ ${label}`);
    console.error(stderr);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

const timeout = setTimeout(() => {
  console.error('✗ smoke test timed out');
  process.exit(1);
}, 15_000);

try {
  const init = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0.0.1' },
  });
  assert(
    init.result?.serverInfo?.name === 'image-gen-mcp',
    'initialize handshake succeeds',
  );
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
  );

  const tools = await send('tools/list', {});
  const names = tools.result.tools.map((t) => t.name);
  assert(
    names.includes('generate_image') && names.includes('list_providers'),
    `tool discovery: ${names.join(', ')}`,
  );

  const lp = await send('tools/call', { name: 'list_providers', arguments: {} });
  const lpStructured = lp.result?.structuredContent;
  assert(
    Array.isArray(lpStructured?.result) && lpStructured.result[0]?.id === 'openai',
    'list_providers returns enabled providers',
  );

  const bad = await send('tools/call', { name: 'generate_image', arguments: {} });
  assert(bad.result?.isError === true, 'generate_image without prompt errors via schema');
} catch (error) {
  console.error('✗ smoke test failed:', error.message);
  console.error(stderr);
  process.exit(1);
} finally {
  clearTimeout(timeout);
  child.kill();
}
console.log('smoke test passed');
