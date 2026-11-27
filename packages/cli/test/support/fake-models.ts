import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

type Prompt = MockLanguageModelV4['doGenerateCalls'][number]['prompt'];

export interface FakeVerdict {
  passed: boolean;
  reason: string;
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function promptText(prompt: Prompt): string {
  return prompt
    .map((message) =>
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => ('text' in part && typeof part.text === 'string' ? part.text : '')).join(''),
    )
    .join('\n');
}

function lastUserText(prompt: Prompt): string {
  const last = prompt.findLast((message) => message.role === 'user');
  return last ? promptText([last]) : '';
}

/**
 * A fake model that can play both parts of an eval run:
 * - as the Agent (streamed chat), it replies with the entry of `replies` whose
 *   key appears in the Visitor's latest message; when the message contains one
 *   of `breakOn`, the reply breaks off after its first piece, as a provider
 *   failing mid-reply does;
 * - as the judge (structured output), it answers with `judge(gradingPrompt)` as JSON.
 */
export function createFakeModel(options: {
  replies?: Record<string, string>;
  breakOn?: string[];
  judge?: (prompt: string) => FakeVerdict;
}) {
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const question = lastUserText(prompt);
      const reply =
        Object.entries(options.replies ?? {}).find(([key]) => question.includes(key))?.[1] ?? "I don't know.";
      if (options.breakOn?.some((key) => question.includes(key))) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'text-1' },
              { type: 'text-delta', id: 'text-1', delta: reply.split(' ')[0] ?? '' },
              { type: 'error', error: new Error('Provider dropped the stream') },
            ],
          }),
        };
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'text-1' },
            ...reply.split(/(?<= )/).map((delta) => ({ type: 'text-delta' as const, id: 'text-1', delta })),
            { type: 'text-end', id: 'text-1' },
            { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
          ],
        }),
      };
    },
    doGenerate: async ({ prompt }) => {
      if (!options.judge) throw new Error('This fake model was not set up to judge.');
      return {
        content: [{ type: 'text', text: JSON.stringify(options.judge(promptText(prompt))) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
  });

  return {
    model,
    /** Every grading prompt the model received as judge, as plain text. */
    get judgePrompts() {
      return model.doGenerateCalls.map((call) => promptText(call.prompt));
    },
  };
}
