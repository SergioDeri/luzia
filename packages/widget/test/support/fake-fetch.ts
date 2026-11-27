import { vi } from 'vitest';

/** A request the widget made, as the server would receive it. */
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  /** Whether the widget has since cancelled the request (e.g. the Visitor started over). */
  cancelled(): boolean;
}

/** The server side of one in-flight streamed reply, driven by the test. */
export interface FakeReply {
  /** Streams a piece of the Agent's reply text to the widget. */
  push(text: string): Promise<void>;
  /** Ends the streamed reply. */
  end(): Promise<void>;
  /** Breaks the streamed reply, as a provider failing mid-reply does. */
  fail(): Promise<void>;
}

export interface FakeFetch {
  requests: RecordedRequest[];
  /** Resolves with the reply stream for the next request the widget makes. */
  nextReply(): Promise<FakeReply>;
  /** Makes the next request fail as a network error would. */
  failNextWithNetworkError(): void;
  /** Makes the server answer the next request with a `{ error: { code, message } }` body. */
  failNextWith(status: number, code: string, message?: string): void;
}

/**
 * Replaces the global `fetch` with a fake luzIA server whose replies the test
 * streams piece by piece, like the real handler's `text/plain` stream.
 */
export function installFakeFetch(): FakeFetch {
  const requests: RecordedRequest[] = [];
  const pendingReplies: Array<(reply: FakeReply) => void> = [];
  const readyReplies: FakeReply[] = [];
  let failNext = false;
  let errorNext: { status: number; code: string; message: string } | null = null;

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
      cancelled: () => init?.signal?.aborted ?? false,
    });

    if (failNext) {
      failNext = false;
      throw new TypeError('Failed to fetch');
    }
    if (errorNext) {
      const { status, code, message } = errorNext;
      errorNext = null;
      return Response.json({ error: { code, message } }, { status });
    }

    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    // Like a real fetch, cancelling the request cuts the reply stream off.
    let cut = false;
    init?.signal?.addEventListener('abort', () => {
      cut = true;
      controller.error(new DOMException('The operation was aborted.', 'AbortError'));
    });
    const reply: FakeReply = {
      push: async (text) => {
        if (!cut) controller.enqueue(encoder.encode(text));
        await settle();
      },
      end: async () => {
        if (!cut) controller.close();
        await settle();
      },
      fail: async () => {
        controller.error(new TypeError('network error'));
        await settle();
      },
    };
    const waiting = pendingReplies.shift();
    if (waiting) waiting(reply);
    else readyReplies.push(reply);

    return new Response(stream, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  });

  return {
    requests,
    nextReply: async () => {
      const ready = readyReplies.shift();
      if (ready) return ready;
      return new Promise<FakeReply>((resolve) => pendingReplies.push(resolve));
    },
    failNextWithNetworkError: () => {
      failNext = true;
    },
    failNextWith: (status, code, message = 'Server error.') => {
      errorNext = { status, code, message };
    },
  };
}

/** Lets pending stream reads and DOM updates run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
