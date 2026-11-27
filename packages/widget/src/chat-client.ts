/** One turn of the conversation, in the shape the luzIA server accepts. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Why a request to the luzIA server failed: a server error code from the
 * `{ error: { code, message } }` body, or `network_error` when no usable
 * response arrived (offline, server down, stream cut off).
 */
export class LuziaRequestError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'LuziaRequestError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Sends the conversation to the luzIA server and yields the Agent's reply text
 * piece by piece as it streams in. Throws {@link LuziaRequestError}.
 */
export async function* streamReply(
  endpoint: string,
  messages: readonly ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) return;
    throw new LuziaRequestError('network_error', describe(cause));
  }

  if (!response.ok) throw await errorFrom(response);
  if (!response.body) throw new LuziaRequestError('network_error', 'The reply had no body.', response.status);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } catch (cause) {
    if (signal?.aborted) return;
    throw new LuziaRequestError('network_error', describe(cause), response.status);
  } finally {
    reader.releaseLock();
  }
}

async function errorFrom(response: Response): Promise<LuziaRequestError> {
  const body: unknown = await response.json().catch(() => undefined);
  const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  return new LuziaRequestError(
    typeof error?.code === 'string' ? error.code : 'http_error',
    typeof error?.message === 'string' ? error.message : `The server answered ${response.status}.`,
    response.status,
  );
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
