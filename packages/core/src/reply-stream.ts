import type { TextStreamPart, ToolSet } from 'ai';
import { errorResponse } from './http.ts';

const PROVIDER_ERROR_MESSAGE = 'The chat model failed to answer. Please try again later.';

/**
 * Turns the model's stream into the chat endpoint's `text/plain` reply.
 *
 * It waits for the first piece of text so that a provider failing up front
 * (bad API key, outage) becomes a `provider_error` JSON response the widget
 * can recognise. A failure after text has started errors the body stream, so
 * the client sees a broken reply instead of a silently truncated one.
 */
export async function replyResponse(fullStream: AsyncIterable<TextStreamPart<ToolSet>>): Promise<Response> {
  const parts = fullStream[Symbol.asyncIterator]();
  const first = await nextText(parts);
  if (first instanceof Error) return errorResponse(502, 'provider_error', PROVIDER_ERROR_MESSAGE);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first === null) controller.close();
      else controller.enqueue(encoder.encode(first));
    },
    async pull(controller) {
      const text = await nextText(parts);
      if (text === null) controller.close();
      else if (text instanceof Error) controller.error(text);
      else controller.enqueue(encoder.encode(text));
    },
    async cancel() {
      await parts.return?.();
    },
  });

  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/** The next piece of reply text, `null` when the reply is complete, or an Error when the model failed. */
async function nextText(parts: AsyncIterator<TextStreamPart<ToolSet>>): Promise<string | null | Error> {
  for (;;) {
    let next: IteratorResult<TextStreamPart<ToolSet>>;
    try {
      next = await parts.next();
    } catch {
      return new Error(PROVIDER_ERROR_MESSAGE);
    }
    const part = next.value;
    if (next.done || part.type === 'finish') return null;
    if (part.type === 'error' || part.type === 'abort') return new Error(PROVIDER_ERROR_MESSAGE);
    if (part.type === 'text-delta' && part.text) return part.text;
  }
}
