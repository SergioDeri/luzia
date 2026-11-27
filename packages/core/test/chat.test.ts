import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { chatRequest, fixturePath } from './support/http.ts';

async function setup({ fixture = 'knowledge-base', chunks }: { fixture?: string; chunks?: string[] } = {}) {
  const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath(fixture) });
  const chat = createFakeChatModel(chunks);
  const handler = createLuziaHandler({ knowledgeBase, chat: { model: chat.model } });
  return { handler, chat };
}

describe('chat over HTTP', () => {
  it('streams the Agent reply to a Visitor question', async () => {
    const { handler } = await setup({ chunks: ['Ada is', ' a backend', ' engineer.'] });

    const response = await handler(chatRequest([{ role: 'user', content: 'Who is Ada?' }]));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(response.body).toBeInstanceOf(ReadableStream);
    expect(await response.text()).toBe('Ada is a backend engineer.');
  });

  it('gives the model the Core and the Instructions on every request', async () => {
    const { handler, chat } = await setup();

    await (await handler(chatRequest([{ role: 'user', content: 'Who is Ada?' }]))).text();
    await (
      await handler(
        chatRequest([
          { role: 'user', content: 'Who is Ada?' },
          { role: 'assistant', content: 'Ada is a backend engineer.' },
          { role: 'user', content: 'What salary does she expect?' },
        ]),
      )
    ).text();

    expect(chat.prompts).toHaveLength(2);
    for (const prompt of chat.prompts) {
      const system = prompt.filter((m) => m.role === 'system').map((m) => m.text).join('\n');
      expect(system).toContain('eight years of experience building payment systems');
      expect(system).toContain('ada@example.com');
      expect(system).toContain('If asked about salary, give the range from the Knowledge Base and suggest a call.');
    }
  });

  it('passes the conversation messages to the model after the system prompt', async () => {
    const { handler, chat } = await setup();

    await (
      await handler(
        chatRequest([
          { role: 'user', content: 'Who is Ada?' },
          { role: 'assistant', content: 'Ada is a backend engineer.' },
          { role: 'user', content: 'Where does she want to work?' },
        ]),
      )
    ).text();

    expect(chat.prompts[0]?.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(chat.prompts[0]?.at(-1)?.text).toBe('Where does she want to work?');
  });

  it('works with a Core file and no Instructions', async () => {
    const { handler, chat } = await setup({ fixture: 'core-only', chunks: ['Hi'] });

    const response = await handler(chatRequest([{ role: 'user', content: 'Who is Ada?' }]));

    expect(await response.text()).toBe('Hi');
    expect(chat.prompts[0]?.[0]?.text).toContain('Ada is a backend engineer.');
  });

  it('accepts the compiled Knowledge Base after a JSON round trip', async () => {
    const built = await buildKnowledgeBase({ dir: fixturePath('knowledge-base') });
    const chat = createFakeChatModel(['ok']);
    const handler = createLuziaHandler({
      knowledgeBase: JSON.parse(JSON.stringify(built)),
      chat: { model: chat.model },
    });

    const response = await handler(chatRequest([{ role: 'user', content: 'Hi' }]));

    expect(await response.text()).toBe('ok');
  });

  it('rejects methods other than POST (chat) and GET (who luzIA talks about)', async () => {
    const { handler, chat } = await setup();

    const response = await handler(new Request('https://portfolio.example/api/luzia', { method: 'PUT' }));

    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({ error: { code: 'method_not_allowed' } });
    expect(chat.prompts).toHaveLength(0);
  });

  it.each([
    ['a body that is not JSON', 'not json'],
    ['no messages', JSON.stringify({ messages: [] })],
    ['a message with an unknown role', JSON.stringify({ messages: [{ role: 'system', content: 'x' }] })],
    ['a conversation not ending with the Visitor', JSON.stringify({ messages: [{ role: 'assistant', content: 'x' }] })],
  ])('rejects %s as an invalid request', async (_name, body) => {
    const { handler, chat } = await setup();

    const response = await handler(
      new Request('https://portfolio.example/api/luzia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } });
    expect(chat.prompts).toHaveLength(0);
  });
});
