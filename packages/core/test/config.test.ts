import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler, LuziaConfigError } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { fixturePath } from './support/http.ts';

const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('knowledge-base') });

describe('handler configuration', () => {
  it.each([
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['google', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ] as const)('fails at startup when the %s API key is missing', (provider, envVar) => {
    const create = () => createLuziaHandler({ knowledgeBase, chat: { provider, model: 'some-model' }, env: {} });

    expect(create).toThrow(LuziaConfigError);
    expect(create).toThrow(new RegExp(`Missing API key.*${envVar}`));
  });

  it('starts when the provider API key is in the server environment', () => {
    const handler = createLuziaHandler({
      knowledgeBase,
      chat: { provider: 'anthropic', model: 'some-model' },
      env: { ANTHROPIC_API_KEY: 'test-key' },
    });

    expect(handler).toBeTypeOf('function');
  });

  it('reads the chat provider and model from the environment when not configured', () => {
    const env = { LUZIA_CHAT_PROVIDER: 'openai', LUZIA_CHAT_MODEL: 'some-model' };

    expect(() => createLuziaHandler({ knowledgeBase, env })).toThrow(/Missing API key.*OPENAI_API_KEY/);
    expect(createLuziaHandler({ knowledgeBase, env: { ...env, OPENAI_API_KEY: 'test-key' } })).toBeTypeOf(
      'function',
    );
  });

  it('fails at startup when no chat model is configured', () => {
    expect(() => createLuziaHandler({ knowledgeBase, env: {} })).toThrow(
      /No chat model configured.*LUZIA_CHAT_PROVIDER.*LUZIA_CHAT_MODEL/s,
    );
  });

  it('fails at startup for an unknown chat provider', () => {
    expect(() =>
      createLuziaHandler({
        knowledgeBase,
        env: { LUZIA_CHAT_PROVIDER: 'acme', LUZIA_CHAT_MODEL: 'x', ACME_API_KEY: 'k' },
      }),
    ).toThrow(/Unknown chat provider "acme"/);
  });

  it('fails at startup when the compiled Knowledge Base is invalid', () => {
    const chat = { model: createFakeChatModel().model };

    expect(() => createLuziaHandler({ knowledgeBase: {} as never, chat })).toThrow(/Run `luzia build`/);
    expect(() => createLuziaHandler({ knowledgeBase: { ...knowledgeBase, format: 99 } as never, chat })).toThrow(
      /format 99/,
    );
  });
});
