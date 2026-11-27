import type { Env } from '../chat-model.ts';
import { LuziaConfigError } from '../errors.ts';
import { errorResponse } from '../http.ts';

/** Bounds on what one conversation can cost the Owner. */
export interface LuziaLimits {
  /** Maximum Visitor messages in one conversation (Agent replies are not counted). */
  maxMessages: number;
  /** Maximum length of each Visitor message, in characters. */
  maxMessageLength: number;
  /** Maximum length of each Agent reply, in tokens; passed to the chat model. */
  maxOutputTokens: number;
}

/** Safe defaults, used for any limit neither configured nor set in the environment. */
export const DEFAULT_LIMITS: Readonly<LuziaLimits> = {
  maxMessages: 20,
  maxMessageLength: 1000,
  maxOutputTokens: 600,
};

/** Environment variables that override each default limit. */
export const LIMIT_ENV: Readonly<Record<keyof LuziaLimits, string>> = {
  maxMessages: 'LUZIA_MAX_MESSAGES',
  maxMessageLength: 'LUZIA_MAX_MESSAGE_LENGTH',
  maxOutputTokens: 'LUZIA_MAX_OUTPUT_TOKENS',
};

/** Config value, else environment variable, else default. Fails at startup on non-positive integers. */
export function resolveLimits(configured: Partial<LuziaLimits> | undefined, env: Env): LuziaLimits {
  const resolve = (name: keyof LuziaLimits): number => {
    const fromConfig = configured?.[name];
    const fromEnv = env[LIMIT_ENV[name]];
    const value = fromConfig ?? (fromEnv?.trim() ? Number(fromEnv) : DEFAULT_LIMITS[name]);
    if (!Number.isInteger(value) || value < 1) {
      const source = fromConfig !== undefined ? `limits.${name}` : LIMIT_ENV[name];
      throw new LuziaConfigError(`Invalid ${source} "${fromConfig ?? fromEnv}": expected a positive whole number.`);
    }
    return value;
  };
  return {
    maxMessages: resolve('maxMessages'),
    maxMessageLength: resolve('maxMessageLength'),
    maxOutputTokens: resolve('maxOutputTokens'),
  };
}

/** The limit error response for a conversation that exceeds `limits`, or `null` when it is within them. */
export function checkLimits(
  messages: readonly { role: string; content: string }[],
  limits: LuziaLimits,
): Response | null {
  const visitorMessages = messages.filter((message) => message.role === 'user');
  if (visitorMessages.length > limits.maxMessages) {
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
  return null;
}
