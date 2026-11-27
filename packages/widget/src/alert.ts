import type { LuziaRequestError } from './chat-client.ts';

/** Server error codes meaning the conversation itself hit a limit (see `luzia-core` limits). */
export const CONVERSATION_LIMIT_CODE = 'conversation_limit_reached';
export const MESSAGE_TOO_LONG_CODE = 'message_too_long';

/**
 * What the Visitor is told after a failed request:
 * - `limit`: the conversation is over; offers the Owner's contact.
 * - `too-long`: the last message was rejected; the Visitor can shorten it.
 * - `unavailable`: anything else (network, provider, server); offers the Owner's contact.
 */
export type FailureKind = 'limit' | 'too-long' | 'unavailable';

export function failureKind(error: LuziaRequestError): FailureKind {
  if (error.code === CONVERSATION_LIMIT_CODE) return 'limit';
  if (error.code === MESSAGE_TOO_LONG_CODE) return 'too-long';
  return 'unavailable';
}

const MESSAGES: Record<FailureKind, string> = {
  limit: "You've reached the message limit for this conversation.",
  'too-long': 'That message is too long. Please shorten it and try again.',
  unavailable: 'luzIA is unavailable right now. Please try again later.',
};

/** Renders the alert for `kind` into `alert`, with the Owner's `contact` when it helps the Visitor. */
export function renderAlert(alert: HTMLElement, kind: FailureKind | null, contact: string): void {
  alert.hidden = kind === null;
  alert.replaceChildren();
  if (kind === null) return;

  alert.append(MESSAGES[kind]);
  const value = contact.trim();
  if (kind === 'too-long' || !value) return;
  alert.append(' You can get in touch directly: ', contactNode(value), '.');
}

/** An email address becomes a `mailto:` link, an http(s) URL a link, anything else plain text. */
function contactNode(contact: string): Node {
  const href = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(contact)
    ? `mailto:${contact}`
    : /^https?:\/\/\S+$/i.test(contact)
      ? contact
      : null;
  if (!href) return document.createTextNode(contact);

  const link = document.createElement('a');
  link.href = href;
  link.textContent = contact;
  if (!href.startsWith('mailto:')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}
