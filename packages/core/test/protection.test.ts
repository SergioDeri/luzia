import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler, type LuziaHandlerConfig } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { chatRequest, fixturePath } from './support/http.ts';

const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('knowledge-base') });

function setup(config: Partial<LuziaHandlerConfig> = {}, chunks?: string[]) {
  const chat = createFakeChatModel(chunks);
  const handler = createLuziaHandler({ knowledgeBase, chat: { model: chat.model }, env: {}, ...config });
  return { handler, chat };
}

const question = [{ role: 'user' as const, content: 'Who is Ada?' }];

describe('allowed origins', () => {
  it('rejects a chat request from an origin that is not allowed', async () => {
    const { handler, chat } = setup({ allowedOrigins: ['https://ada.dev'] });

    const response = await handler(chatRequest(question, { headers: { origin: 'https://thief.example' } }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(chat.prompts).toHaveLength(0);
  });

  it('accepts same-origin requests with no configuration', async () => {
    const { handler } = setup({}, ['ok']);

    const response = await handler(chatRequest(question, { headers: { origin: 'https://portfolio.example' } }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('accepts a request whose origin matches the host it arrived on behind a proxy', async () => {
    const { handler } = setup({}, ['ok']);

    const response = await handler(
      chatRequest(question, {
        url: 'http://internal:3000/api/luzia',
        headers: { origin: 'https://portfolio.example', 'x-forwarded-host': 'portfolio.example' },
      }),
    );

    expect(response.status).toBe(200);
  });

  it('accepts requests without an Origin header (server-side callers such as luzia eval)', async () => {
    const { handler } = setup({ allowedOrigins: ['https://ada.dev'] }, ['ok']);

    const response = await handler(chatRequest(question, { url: 'http://localhost/api/luzia' }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('streams the reply with CORS headers to an allowed origin', async () => {
    const { handler } = setup({ allowedOrigins: ['https://ada.dev'] }, ['Ada is', ' an engineer.']);

    const response = await handler(chatRequest(question, { headers: { origin: 'https://ada.dev' } }));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://ada.dev');
    expect(response.headers.get('vary')).toMatch(/origin/i);
    expect(await response.text()).toBe('Ada is an engineer.');
  });

  it('adds CORS headers to error responses for an allowed origin', async () => {
    const { handler } = setup({ allowedOrigins: ['https://ada.dev'] });

    const response = await handler(
      new Request('https://portfolio.example/api/luzia', {
        method: 'POST',
        headers: { origin: 'https://ada.dev', 'content-type': 'application/json' },
        body: 'not json',
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://ada.dev');
  });

  it('reads allowed origins from LUZIA_ALLOWED_ORIGINS', async () => {
    const { handler } = setup({ env: { LUZIA_ALLOWED_ORIGINS: 'https://ada.dev, https://www.ada.dev/' } }, ['ok']);

    const allowed = await handler(chatRequest(question, { headers: { origin: 'https://www.ada.dev' } }));
    const rejected = await handler(chatRequest(question, { headers: { origin: 'https://thief.example' } }));

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(403);
  });

  it('fails at startup on an allowed origin that is not an origin', () => {
    expect(() => setup({ allowedOrigins: ['ada.dev'] })).toThrow(/Invalid allowed origin "ada.dev"/);
  });
});

function preflight(origin: string) {
  return new Request('https://portfolio.example/api/luzia', {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
}

describe('CORS preflight', () => {
  it('answers a preflight from an allowed origin', async () => {
    const { handler, chat } = setup({ allowedOrigins: ['https://ada.dev'] });

    const response = await handler(preflight('https://ada.dev'));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://ada.dev');
    expect(response.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
    expect(response.headers.get('access-control-max-age')).toMatch(/^\d+$/);
    expect(chat.prompts).toHaveLength(0);
  });

  it('refuses a preflight from an origin that is not allowed', async () => {
    const { handler } = setup({ allowedOrigins: ['https://ada.dev'] });

    const response = await handler(preflight('https://thief.example'));

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: 'origin_not_allowed' } });
  });
});

function conversation(visitorMessages: number) {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (let i = 1; i <= visitorMessages; i++) {
    if (i > 1) messages.push({ role: 'assistant', content: `Answer ${i - 1}` });
    messages.push({ role: 'user', content: `Question ${i}` });
  }
  return messages;
}

describe('limits', () => {
  it('stops a conversation that goes past the maximum number of Visitor messages', async () => {
    const { handler, chat } = setup({ limits: { maxMessages: 3 } }, ['ok']);

    expect(await (await handler(chatRequest(conversation(3)))).text()).toBe('ok');
    const response = await handler(chatRequest(conversation(4)));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'conversation_limit_reached' } });
    expect(chat.prompts).toHaveLength(1);
  });

  it('allows 20 Visitor messages per conversation by default', async () => {
    const { handler } = setup({}, ['ok']);

    expect((await handler(chatRequest(conversation(20)))).status).toBe(200);
    expect((await handler(chatRequest(conversation(21)))).status).toBe(429);
  });

  it('rejects a Visitor message longer than the maximum length', async () => {
    const { handler, chat } = setup({ limits: { maxMessageLength: 10 } }, ['ok']);

    expect((await handler(chatRequest([{ role: 'user', content: '0123456789' }]))).status).toBe(200);
    const response = await handler(chatRequest([{ role: 'user', content: '0123456789!' }]));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'message_too_long' } });
    expect(chat.prompts).toHaveLength(1);
  });

  it('allows Visitor messages of up to 1000 characters by default', async () => {
    const { handler } = setup({}, ['ok']);

    expect((await handler(chatRequest([{ role: 'user', content: 'a'.repeat(1000) }]))).status).toBe(200);
    expect((await handler(chatRequest([{ role: 'user', content: 'a'.repeat(1001) }]))).status).toBe(413);
  });

  it('caps the Agent reply at 600 output tokens by default', async () => {
    const { handler, chat } = setup({}, ['ok']);

    await (await handler(chatRequest(question))).text();

    expect(chat.model.doStreamCalls[0]?.maxOutputTokens).toBe(600);
  });

  it('passes a configured maximum reply length to the model', async () => {
    const { handler, chat } = setup({ limits: { maxOutputTokens: 120 } }, ['ok']);

    await (await handler(chatRequest(question))).text();

    expect(chat.model.doStreamCalls[0]?.maxOutputTokens).toBe(120);
  });

  it('reads limits from the environment', async () => {
    const { handler, chat } = setup(
      { env: { LUZIA_MAX_MESSAGES: '1', LUZIA_MAX_MESSAGE_LENGTH: '50', LUZIA_MAX_OUTPUT_TOKENS: '80' } },
      ['ok'],
    );

    await (await handler(chatRequest(question))).text();
    expect(chat.model.doStreamCalls[0]?.maxOutputTokens).toBe(80);
    expect((await handler(chatRequest(conversation(2)))).status).toBe(429);
    expect((await handler(chatRequest([{ role: 'user', content: 'a'.repeat(51) }]))).status).toBe(413);
  });

  it('returns limit errors with CORS headers to an allowed origin', async () => {
    const { handler } = setup({ allowedOrigins: ['https://ada.dev'], limits: { maxMessages: 1 } });

    const response = await handler(chatRequest(conversation(2), { headers: { origin: 'https://ada.dev' } }));

    expect(response.status).toBe(429);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://ada.dev');
  });

  it.each([
    [{ limits: { maxMessages: 0 } }, /limits\.maxMessages/],
    [{ limits: { maxOutputTokens: 1.5 } }, /limits\.maxOutputTokens/],
    [{ env: { LUZIA_MAX_MESSAGE_LENGTH: 'lots' } }, /LUZIA_MAX_MESSAGE_LENGTH/],
  ] as const)('fails at startup on an invalid limit (%o)', (config, message) => {
    expect(() => setup(config)).toThrow(message);
  });
});
