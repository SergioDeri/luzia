import path from 'node:path';
import { runCli } from '@luzia/cli';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Smoke test of the deployable function: the Knowledge Base builds, the module
// loads like it would on Vercel, and only the portfolio's origins get through.
// No chat request is sent, so the API key is a placeholder and nothing hits the network.
const exampleDir = path.resolve(import.meta.dirname, '..');
let fn: typeof import('../api/luzia.ts');

beforeAll(async () => {
  const output: string[] = [];
  const exitCode = await runCli(['build'], {
    cwd: exampleDir,
    env: {},
    stdout: (line) => output.push(line),
    stderr: (line) => output.push(line),
  });
  expect(exitCode, output.join('\n')).toBe(0);

  vi.stubEnv('LUZIA_CHAT_PROVIDER', 'anthropic');
  vi.stubEnv('LUZIA_CHAT_MODEL', 'claude-sonnet-5-5');
  vi.stubEnv('ANTHROPIC_API_KEY', 'placeholder');
  fn = await import('../api/luzia.ts');
});

const ENDPOINT = 'https://luzia-jamie.vercel.app/api/luzia';

function preflight(origin: string): Request {
  return new Request(ENDPOINT, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  });
}

describe('standalone Vercel function', () => {
  it('answers CORS preflight from the portfolio origin', async () => {
    const response = await fn.OPTIONS(preflight('https://jamie.example.com'));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://jamie.example.com');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('rejects chat requests from any other origin', async () => {
    const response = await fn.POST(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { origin: 'https://someone-else.example', 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
  });
});
