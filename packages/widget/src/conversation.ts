import { LuziaRequestError, streamReply, type ChatMessage } from './chat-client.ts';

/** `streaming` while a reply is arriving; `error` after the last request failed. */
export type ConversationStatus = 'idle' | 'streaming' | 'error';

/** An immutable snapshot; every change produces a new one. */
export interface ConversationState {
  /** The conversation so far. While streaming, the last message is the partial reply. */
  readonly messages: readonly ChatMessage[];
  readonly status: ConversationStatus;
  /** Why the last request failed, when `status` is `error`. */
  readonly error: LuziaRequestError | null;
  /**
   * The Visitor message the last failed request took back out of `messages`
   * because no reply to it arrived, so the view can give it back for editing.
   * Keeping it would make the next send carry two Visitor turns in a row.
   */
  readonly unsent: string | null;
}

export interface ConversationOptions {
  /** Where to send the conversation; read at send time so it can change. */
  endpoint: () => string;
  /** Messages to start from (e.g. a restored conversation). */
  messages?: readonly ChatMessage[];
}

type Listener = (state: ConversationState) => void;

/**
 * The Visitor's conversation with the Agent, independent of any DOM. Sending
 * a message posts the whole conversation and grows the Agent's reply as it
 * streams. The view subscribes and renders each snapshot.
 */
export class Conversation {
  #state: ConversationState;
  #listeners = new Set<Listener>();
  #options: ConversationOptions;
  #abort: AbortController | null = null;

  constructor(options: ConversationOptions) {
    this.#options = options;
    this.#state = { messages: options.messages ?? [], status: 'idle', error: null, unsent: null };
  }

  get state(): ConversationState {
    return this.#state;
  }

  /** Calls `listener` on every change. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Sends a Visitor message and streams the reply. Returns `false` (and does
   * nothing) when the text is blank or a reply is still streaming.
   */
  send(text: string): boolean {
    const content = text.trim();
    if (!content || this.#state.status === 'streaming') return false;
    void this.#stream([...this.#state.messages, { role: 'user', content }]);
    return true;
  }

  /** Stops a streaming reply, keeping what has arrived so far. */
  abort(): void {
    this.#abort?.abort();
  }

  /**
   * Starts over from `messages` (by default, an empty conversation). Any
   * streaming reply is cancelled and discarded.
   */
  reset(messages: readonly ChatMessage[] = []): void {
    const streaming = this.#abort;
    this.#abort = null;
    streaming?.abort();
    this.#set({ messages, status: 'idle', error: null, unsent: null });
  }

  async #stream(history: ChatMessage[]): Promise<void> {
    const abort = new AbortController();
    this.#abort = abort;
    let reply = '';
    this.#set({ messages: [...history, { role: 'assistant', content: reply }], status: 'streaming', error: null, unsent: null });

    try {
      for await (const piece of streamReply(this.#options.endpoint(), history, abort.signal)) {
        if (this.#abort !== abort) return;
        reply += piece;
        this.#set({ ...this.#state, messages: [...history, { role: 'assistant', content: reply }] });
      }
      if (this.#abort !== abort) return; // reset while streaming
      this.#set({ messages: withReply(history, reply), status: 'idle', error: null, unsent: null });
    } catch (cause) {
      if (this.#abort !== abort) return;
      const error =
        cause instanceof LuziaRequestError ? cause : new LuziaRequestError('network_error', String(cause));
      // A reply that broke off mid-stream is kept, so the conversation still alternates.
      // A message nothing arrived for is taken back out (see `unsent`).
      if (reply) {
        this.#set({ messages: withReply(history, reply), status: 'error', error, unsent: null });
      } else {
        this.#set({ messages: history.slice(0, -1), status: 'error', error, unsent: history.at(-1)?.content ?? null });
      }
    } finally {
      if (this.#abort === abort) this.#abort = null;
    }
  }

  #set(state: ConversationState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener(state);
  }
}

/** Drops the reply placeholder when nothing arrived. */
function withReply(history: ChatMessage[], reply: string): ChatMessage[] {
  return reply ? [...history, { role: 'assistant', content: reply }] : history;
}
