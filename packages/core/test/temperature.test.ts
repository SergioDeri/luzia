import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, createLuziaHandler, LuziaConfigError } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { chatRequest, fixturePath } from './support/http.ts';

const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('knowledge-base') });

async function temperatureSent(config: { temperature?: number; env?: Record<string, string> }) {
  const chat = createFakeChatModel(['ok']);
  const handler = createLuziaHandler({ knowledgeBase, chat: { model: chat.model }, env: config.env ?? {}, ...(config.temperature === undefined ? {} : { temperature: config.temperature }) });
  const response = await handler(chatRequest([{ role: 'user', content: 'Hi' }]));
  await response.text();
  return chat.model.doStreamCalls[0]!.temperature;
}

describe('temperature', () => {
  it('leaves the provider’s default when none is set', async () => {
    expect(await temperatureSent({})).toBeUndefined();
  });

  it('passes the configured temperature to the model', async () => {
    expect(await temperatureSent({ temperature: 0.8 })).toBe(0.8);
  });

  it('reads LUZIA_TEMPERATURE from the environment', async () => {
    expect(await temperatureSent({ env: { LUZIA_TEMPERATURE: '0.6' } })).toBe(0.6);
  });

  it('fails at startup on a temperature that is not a number from 0 to 2', () => {
    const create = (value: string) => () =>
      createLuziaHandler({ knowledgeBase, chat: { model: createFakeChatModel().model }, env: { LUZIA_TEMPERATURE: value } });
    expect(create('hot')).toThrow(LuziaConfigError);
    expect(create('3')).toThrow(/LUZIA_TEMPERATURE/);
  });
});
