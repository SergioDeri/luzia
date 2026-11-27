import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { fixturePath } from './support/http.ts';

async function setup(options: { allowedOrigins?: string[] } = {}) {
  const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('knowledge-base') });
  const chat = createFakeChatModel(['unused']);
  const handler = createLuziaHandler({ knowledgeBase, chat: { model: chat.model }, env: {}, ...options });
  return { handler, chat };
}

const ownerRequest = (headers: Record<string, string> = {}) =>
  new Request('https://portfolio.example/api/luzia', { method: 'GET', headers: { accept: 'application/json', ...headers } });

describe('who luzIA talks about', () => {
  it('answers GET with the Owner’s name from the Core, without calling the model', async () => {
    const { handler, chat } = await setup();

    const response = await handler(ownerRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ owner: { name: 'Ada Example' } });
    expect(chat.prompts).toHaveLength(0);
  });

  it('shares it with allowed origins only, like the chat', async () => {
    const { handler } = await setup({ allowedOrigins: ['https://ada.example'] });

    const allowed = await handler(ownerRequest({ origin: 'https://ada.example' }));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://ada.example');

    const other = await handler(ownerRequest({ origin: 'https://elsewhere.example' }));
    expect(other.status).toBe(403);
  });

  it('allows GET in the CORS preflight', async () => {
    const { handler } = await setup({ allowedOrigins: ['https://ada.example'] });

    const preflight = await handler(
      new Request('https://portfolio.example/api/luzia', {
        method: 'OPTIONS',
        headers: { origin: 'https://ada.example', 'access-control-request-method': 'GET' },
      }),
    );

    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/GET/);
  });
});
