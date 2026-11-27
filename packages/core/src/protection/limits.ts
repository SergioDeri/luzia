import type { Env } from '../chat-model.ts';
import { LuziaConfigError } from '../errors.ts';
import { errorResponse } from '../http.ts';

/**
 * Bounds on what one request can cost the Owner. The server is stateless, so
 * the whole conversation (Agent replies included) arrives from the client with
 * every request and is bounded here.
 */
export interface LuziaLimits {
  /**
   * Maximum Visitor messages in one conversation. The conversation as a whole
   * (Visitor messages and Agent replies) may hold at most `2 × maxMessages − 1`
   * messages, the most an alternating conversation can have.
   */
  maxMessages: number;
  /** Maximum length of each Visitor message, in characters. */
  maxMessageLength: number;
  /** Maximum length of each Agent reply, in tokens; passed to the chat model. */
  maxOutputTokens: number;
  /**
   * Maximum length of each Agent reply sent back in the conversation, in
   * characters. Replies come from the client and could be forged to any size,
   * so they are capped too. Defaults to {@link REPLY_CHARS_PER_TOKEN} ×
   * `maxOutputTokens`, comfortably above what a reply of that many tokens holds.
   */
  maxReplyLength: number;
  /** Maximum size of the request body, in bytes, checked before it is read as JSON. */
  maxRequestBytes: number;
}

/** Characters allowed per output token when `maxReplyLength` is not set. */
export const REPLY_CHARS_PER_TOKEN = 8;

/**
 * Safe defaults, used for any limit neither configured nor set in the
 * environment. `maxReplyLength` follows `maxOutputTokens` when only the latter
 * is changed.
 */
export const DEFAULT_LIMITS: Readonly<LuziaLimits> = {
  maxMessages: 20,
  maxMessageLength: 1000,
  maxOutputTokens: 600,
  maxReplyLength: 600 * REPLY_CHARS_PER_TOKEN,
  maxRequestBytes: 512 * 1024,
};

/** Environment variables that override each default limit. */
export const LIMIT_ENV: Readonly<Record<keyof LuziaLimits, string>> = {
  maxMessages: 'LUZIA_MAX_MESSAGES',
  maxMessageLength: 'LUZIA_MAX_MESSAGE_LENGTH',
  maxOutputTokens: 'LUZIA_MAX_OUTPUT_TOKENS',
  maxReplyLength: 'LUZIA_MAX_REPLY_LENGTH',
  maxRequestBytes: 'LUZIA_MAX_REQUEST_BYTES',
};

/** Config value, else environment variable, else default. Fails at startup on non-positive integers. */
export function resolveLimits(configured: Partial<LuziaLimits> | undefined, env: Env): LuziaLimits {
  const resolve = (name: keyof LuziaLimits, fallback: number = DEFAULT_LIMITS[name]): number => {
    const fromConfig = configured?.[name];
    const fromEnv = env[LIMIT_ENV[name]];
    const value = fromConfig ?? (fromEnv?.trim() ? Number(fromEnv) : fallback);
    if (!Number.isInteger(value) || value < 1) {
      const source = fromConfig !== undefined ? `limits.${name}` : LIMIT_ENV[name];
      throw new LuziaConfigError(`Invalid ${source} "${fromConfig ?? fromEnv}": expected a positive whole number.`);
    }
    return value;
  };
  const maxOutputTokens = resolve('maxOutputTokens');
  return {
    maxMessages: resolve('maxMessages'),
    maxMessageLength: resolve('maxMessageLength'),
    maxOutputTokens,
    maxReplyLength: resolve('maxReplyLength', maxOutputTokens * REPLY_CHARS_PER_TOKEN),
    maxRequestBytes: resolve('maxRequestBytes'),
  };
}

/** The limit error response for a conversation that exceeds `limits`, or `null` when it is within them. */
export function checkLimits(
  messages: readonly { role: string; content: string }[],
  limits: LuziaLimits,
): Response | null {
  const visitorMessages = messages.filter((message) => message.role === 'user');
  if (visitorMessages.length > limits.maxMessages || messages.length > 2 * limits.maxMessages - 1) {
    return errorResponse(
      429,
      'conversation_limit_reached',
      `This conversation has reached its limit of ${limits.maxMessages} messages.`,
    );
  }
  if (visitorMessages.some((message) => message.content.length > limits.maxMessageLength)) {
    return errorResponse(
      413,
      'message_too_long',
      `Messages can be at most ${limits.maxMessageLength} characters long.`,
    );
  }
  if (messages.some((message) => message.role !== 'user' && message.content.length > limits.maxReplyLength)) {
    return errorResponse(
      413,
      'message_too_long',
      `Agent replies in the conversation can be at most ${limits.maxReplyLength} characters long.`,
    );
  }
  return null;
}

/**
 * Reads the request body as text, giving up as soon as it grows past
 * `maxBytes` (whether or not it declared a `Content-Length`). Returns the
 * `request_too_large` error response in that case.
 */
export async function readBodyWithinLimit(request: Request, maxBytes: number): Promise<string | Response> {
  const tooLarge = () =>
    errorResponse(413, 'request_too_large', `Requests can be at most ${maxBytes} bytes long.`);

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
