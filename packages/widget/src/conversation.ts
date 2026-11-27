import { MESSAGE_TOO_LONG_CODE } from './alert.ts';
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
    this.#state = { messages: options.messages ?? [], status: 'idle', error: null };
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
    this.#set({ messages, status: 'idle', error: null });
  }

  async #stream(history: ChatMessage[]): Promise<void> {
    const abort = new AbortController();
    this.#abort = abort;
    let reply = '';
    this.#set({ messages: [...history, { role: 'assistant', content: reply }], status: 'streaming', error: null });

    try {
      for await (const piece of streamReply(this.#options.endpoint(), history, abort.signal)) {
        if (this.#abort !== abort) return;
        reply += piece;
        this.#set({ ...this.#state, messages: [...history, { role: 'assistant', content: reply }] });
      }
      if (this.#abort !== abort) return; // reset while streaming
      this.#set({ messages: withReply(history, reply), status: 'idle', error: null });
    } catch (cause) {
      if (this.#abort !== abort) return;
      const error =
        cause instanceof LuziaRequestError ? cause : new LuziaRequestError('network_error', String(cause));
      // A message the server refused for its length is dropped so the next send doesn't repeat it.
      const kept = error.code === MESSAGE_TOO_LONG_CODE ? history.slice(0, -1) : withReply(history, reply);
      this.#set({ messages: kept, status: 'error', error });
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
