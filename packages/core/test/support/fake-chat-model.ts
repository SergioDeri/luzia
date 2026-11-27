import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

/**
 * A chat model that streams `chunks` as its reply and records every prompt it
 * receives, so tests can assert on what reached the model.
 */
export function createFakeChatModel(chunks: string[] = ['Hello', ' from', ' luzIA']) {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          ...chunks.map((delta) => ({ type: 'text-delta' as const, id: 'text-1', delta })),
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: chunks.length, text: chunks.length, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });

  return {
    model,
    /** Every prompt the model received, rendered as plain text per message. */
    get prompts() {
      return model.doStreamCalls.map((call) =>
        call.prompt.map((message) => ({
          role: message.role,
          text:
            typeof message.content === 'string'
              ? message.content
              : message.content
                  .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
                  .join(''),
        })),
      );
    },
  };
}
