import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler, LuziaConfigError } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { createFakeEmbeddingModel } from './support/fake-embedding-model.ts';
import { chatRequest, fixturePath, type ChatMessage } from './support/http.ts';

async function setup({ topK }: { topK?: number } = {}) {
  const embedder = createFakeEmbeddingModel();
  const knowledgeBase = await buildKnowledgeBase({
    dir: fixturePath('with-documents'),
    embedding: { model: embedder.model },
  });
  const chat = createFakeChatModel(['ok']);
  const handler = createLuziaHandler({
    knowledgeBase,
    chat: { model: chat.model },
    embedding: { model: embedder.model },
    ...(topK ? { retrieval: { topK } } : {}),
    env: {},
  });

  async function ask(messages: ChatMessage[]) {
    const response = await handler(chatRequest(messages));
    expect(response.status).toBe(200);
    await response.text();
    const prompt = chat.prompts.at(-1) ?? [];
    return prompt.filter((m) => m.role === 'system').map((m) => m.text).join('\n');
  }

  return { ask, embedder, knowledgeBase };
}

describe('retrieval (hybrid RAG)', () => {
  it('gives the model the chunk holding a fact that lives only in a non-Core file, plus the full Core', async () => {
    const { ask } = await setup({ topK: 1 });

    const system = await ask([{ role: 'user', content: 'Has Ada worked with Kubernetes?' }]);

    expect(system).toContain('Go services running on Kubernetes');
    expect(system).toContain('eight years of experience building payment systems');
    expect(system).toContain('ada@example.com');
    expect(system).toContain('If asked about salary, give the range from the Knowledge Base and suggest a call.');
    expect(system).not.toContain('cello');
    expect(system).not.toContain('90,000');
  });

  it('retrieves different chunks for different questions', async () => {
    const { ask } = await setup({ topK: 1 });

    const system = await ask([{ role: 'user', content: 'Does she play in an orchestra?' }]);

    expect(system).toContain('plays the cello');
    expect(system).not.toContain('Go services running on Kubernetes');
  });

  it('adds the most relevant chunks first, up to top-k', async () => {
    const { ask } = await setup({ topK: 2 });

    const system = await ask([{ role: 'user', content: 'What salary in EUR does she expect?' }]);

    expect(system).toContain('between 90,000 and 110,000 EUR');
    expect(system.match(/<excerpt /g)).toHaveLength(2);
  });

  it("embeds the Visitor's latest message with their previous one as light context", async () => {
    const { ask, embedder } = await setup({ topK: 1 });
    const before = embedder.embeddedValues.length;

    const system = await ask([
      { role: 'user', content: 'Tell me about the ledger migration.' },
      { role: 'assistant', content: 'Ada led it at Northwind.' },
      { role: 'user', content: 'Which technologies?' },
    ]);

    expect(embedder.embeddedValues.slice(before)).toEqual(['Tell me about the ledger migration.\nWhich technologies?']);
    expect(system).toContain('Go services running on Kubernetes');
  });

  it('gives retrieved chunks their heading path', async () => {
    const { ask } = await setup({ topK: 1 });

    const system = await ask([{ role: 'user', content: 'Kubernetes?' }]);

    expect(system).toContain('Experience > Northwind Payments > Ledger migration');
  });

  it('works after a JSON round trip of the compiled Knowledge Base', async () => {
    const embedder = createFakeEmbeddingModel();
    const built = await buildKnowledgeBase({ dir: fixturePath('with-documents'), embedding: { model: embedder.model } });
    const chat = createFakeChatModel(['ok']);
    const handler = createLuziaHandler({
      knowledgeBase: JSON.parse(JSON.stringify(built)),
      chat: { model: chat.model },
      embedding: { model: embedder.model },
      retrieval: { topK: 1 },
    });

    await (await handler(chatRequest([{ role: 'user', content: 'Does she run a marathon?' }]))).text();

    expect(chat.prompts[0]?.[0]?.text).toContain('Valencia marathon');
  });
});

describe('embeddings model at server startup', () => {
  const chat = { model: createFakeChatModel().model };

  it('refuses to start when the configured embeddings model differs from the one in the artifact', async () => {
    const knowledgeBase = await buildKnowledgeBase({
      dir: fixturePath('with-documents'),
      embedding: { model: createFakeEmbeddingModel({ modelId: 'small' }).model },
    });

    const create = () =>
      createLuziaHandler({
        knowledgeBase,
        chat,
        embedding: { model: createFakeEmbeddingModel({ modelId: 'large' }).model },
      });

    expect(create).toThrow(LuziaConfigError);
    expect(create).toThrow(/Embeddings model mismatch.*"fake:small".*"fake:large"/s);
  });

  it('refuses to start when the artifact has chunks but no embeddings model is configured', async () => {
    const knowledgeBase = await buildKnowledgeBase({
      dir: fixturePath('with-documents'),
      embedding: { model: createFakeEmbeddingModel().model },
    });

    expect(() => createLuziaHandler({ knowledgeBase, chat, env: {} })).toThrow(
      /no embeddings model is configured.*LUZIA_EMBEDDING_PROVIDER.*LUZIA_EMBEDDING_MODEL/s,
    );
  });

  it('compares against the embeddings model configured through the environment', async () => {
    const knowledgeBase = await buildKnowledgeBase({
      dir: fixturePath('with-documents'),
      embedding: { model: createFakeEmbeddingModel().model },
    });
    const env = { LUZIA_EMBEDDING_PROVIDER: 'openai', LUZIA_EMBEDDING_MODEL: 'text-embedding-3-small' };

    expect(() => createLuziaHandler({ knowledgeBase, chat, env })).toThrow(/Missing API key.*OPENAI_API_KEY/);
    expect(() => createLuziaHandler({ knowledgeBase, chat, env: { ...env, OPENAI_API_KEY: 'k' } })).toThrow(
      /Embeddings model mismatch.*"fake:fake-embedding".*text-embedding-3-small/s,
    );
  });

  it('starts a Core-only Knowledge Base with no embeddings model configured', async () => {
    const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('knowledge-base'), env: {} });
    const fakeChat = createFakeChatModel(['ok']);
    const handler = createLuziaHandler({ knowledgeBase, chat: { model: fakeChat.model }, env: {} });

    const response = await handler(chatRequest([{ role: 'user', content: 'Who is Ada?' }]));

    expect(await response.text()).toBe('ok');
    expect(fakeChat.prompts[0]?.[0]?.text).toContain('ada@example.com');
  });

  it('refuses to start when the artifact has chunks without an embeddings model id', async () => {
    const knowledgeBase = await buildKnowledgeBase({
      dir: fixturePath('with-documents'),
      embedding: { model: createFakeEmbeddingModel().model },
    });

    expect(() => createLuziaHandler({ knowledgeBase: { ...knowledgeBase, embeddingModel: null }, chat })).toThrow(
      /Run `luzia build`/,
    );
  });
});
