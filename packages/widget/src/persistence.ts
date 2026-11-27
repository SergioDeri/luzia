import type { ChatMessage } from './chat-client.ts';
import type { Conversation, ConversationState } from './conversation.ts';

/** Bumped whenever the stored shape changes; other versions are ignored. */
const FORMAT_VERSION = 1;

interface StoredConversation {
  v: typeof FORMAT_VERSION;
  messages: ChatMessage[];
}

/**
 * The `sessionStorage` key for the conversation with `endpoint`, so widgets
 * talking to different servers on one page keep separate conversations.
 * Relative endpoints are resolved so `/api/luzia` and its absolute URL match.
 */
export function storageKey(endpoint: string): string {
  let resolved = endpoint;
  try {
    resolved = new URL(endpoint, document.baseURI).href;
  } catch {
    // Not a URL we can resolve; key on it as written.
  }
  return `luzia:conversation:${resolved}`;
}

/**
 * Keeps `conversation` in the tab's `sessionStorage` under `key`: restores a
 * stored conversation now (unless it already has messages) and stores every
 * settled change. A reply still streaming is never stored, so a page left
 * mid-reply comes back with the Visitor's question but without the partial
 * answer. An empty conversation removes the stored copy. Unreadable or
 * foreign data is ignored, and storage being unavailable (blocked, full) only
 * means the conversation is not remembered.
 *
 * Returns a function that stops storing changes.
 */
export function persistConversation(conversation: Conversation, key: string): () => void {
  const storage = sessionStorageOrNull();
  if (!storage) return () => {};

  const stored = read(storage, key);
  if (stored && conversation.state.messages.length === 0) conversation.reset(stored);

  let last = serialize(settledMessages(conversation.state));
  return conversation.subscribe((state) => {
    const messages = settledMessages(state);
    const next = serialize(messages);
    if (next === last) return;
    last = next;
    try {
      if (messages.length === 0) storage.removeItem(key);
      else storage.setItem(key, next);
    } catch {
      // Quota exceeded or storage revoked: carry on without remembering.
    }
  });
}

/** The messages worth keeping: everything except a reply still streaming. */
function settledMessages(state: ConversationState): readonly ChatMessage[] {
  return state.status === 'streaming' ? state.messages.slice(0, -1) : state.messages;
}

function serialize(messages: readonly ChatMessage[]): string {
  const stored: StoredConversation = { v: FORMAT_VERSION, messages: [...messages] };
  return JSON.stringify(stored);
}

function read(storage: Storage, key: string): ChatMessage[] | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (!isStoredConversation(data)) return null;
    return data.messages.map(({ role, content }) => ({ role, content }));
  } catch {
    return null;
  }
}

function isStoredConversation(data: unknown): data is StoredConversation {
  if (typeof data !== 'object' || data === null) return false;
  const { v, messages } = data as { v?: unknown; messages?: unknown };
  return v === FORMAT_VERSION && Array.isArray(messages) && messages.every(isChatMessage);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const { role, content } = value as { role?: unknown; content?: unknown };
  return (role === 'user' || role === 'assistant') && typeof content === 'string';
}

/** `sessionStorage`, or `null` where it is missing or access throws (e.g. sandboxed iframes). */
function sessionStorageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
