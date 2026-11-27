import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler } from '../src/index.ts';
import { chatRequest, fixturePath } from './support/http.ts';

const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('knowledge-base') });
const question = [{ role: 'user' as const, content: 'Who is Ada?' }];

/** A chat model whose provider fails, either before replying or after `chunksBeforeError` pieces. */
function failingModel(chunksBeforeError?: string[]) {
  return new MockLanguageModelV4({
    doStream: async () => {
      if (!chunksBeforeError) throw new Error('Provider is down');
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start' as const, warnings: [] },
            { type: 'text-start' as const, id: 'text-1' },
            ...chunksBeforeError.map((delta) => ({ type: 'text-delta' as const, id: 'text-1', delta })),
            { type: 'error' as const, error: new Error('Provider dropped the stream') },
          ],
        }),
      };
    },
  });
}

describe('chat model failures', () => {
  it('answers with a provider error when the model fails before replying', async () => {
    const handler = createLuziaHandler({ knowledgeBase, chat: { model: failingModel() }, env: {} });

    const response = await handler(chatRequest(question));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'provider_error' } });
  });

  it('breaks the reply stream when the model fails mid-reply, so the widget can tell', async () => {
    const handler = createLuziaHandler({ knowledgeBase, chat: { model: failingModel(['Ada is']) }, env: {} });

    const response = await handler(chatRequest(question));

    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow();
  });
});
