import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { LuziaConfigError } from './errors.ts';

/** A ready-made AI SDK language model (any provider). */
export type ChatModelInstance = Exclude<LanguageModel, string>;

export const CHAT_PROVIDERS = {
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', create: (apiKey: string) => createAnthropic({ apiKey }) },
  openai: { apiKeyEnv: 'OPENAI_API_KEY', create: (apiKey: string) => createOpenAI({ apiKey }) },
  google: { apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY', create: (apiKey: string) => createGoogle({ apiKey }) },
} as const;

export type ChatProvider = keyof typeof CHAT_PROVIDERS;

/**
 * How the Agent's chat model is chosen. Either a built-in provider by name
 * (API key read server-side from the provider's environment variable unless
 * given), or any AI SDK language model instance.
 */
export type ChatModelConfig =
  | { provider: ChatProvider; model: string; apiKey?: string }
  | { model: ChatModelInstance };

export type Env = Record<string, string | undefined>;

/** Environment variables used when `chat` is omitted from the handler config. */
export const CHAT_PROVIDER_ENV = 'LUZIA_CHAT_PROVIDER';
export const CHAT_MODEL_ENV = 'LUZIA_CHAT_MODEL';

export function resolveChatModel(config: ChatModelConfig | undefined, env: Env): ChatModelInstance {
  const chat = config ?? chatModelConfigFromEnv(env);
  if (typeof chat.model !== 'string') return chat.model;
  if (!('provider' in chat)) {
    throw new LuziaConfigError('chat.model must be an AI SDK language model when no provider is given.');
  }

  const provider = CHAT_PROVIDERS[chat.provider];
  if (!provider) {
    throw new LuziaConfigError(
      `Unknown chat provider "${chat.provider}". Use one of: ${Object.keys(CHAT_PROVIDERS).join(', ')}.`,
    );
  }
  const apiKey = chat.apiKey ?? env[provider.apiKeyEnv];
  if (!apiKey) {
    throw new LuziaConfigError(
      `Missing API key for chat provider "${chat.provider}". Set the ${provider.apiKeyEnv} environment variable on the server.`,
    );
  }
  return provider.create(apiKey)(chat.model);
}

function chatModelConfigFromEnv(env: Env): ChatModelConfig {
  const provider = env[CHAT_PROVIDER_ENV];
  const model = env[CHAT_MODEL_ENV];
  if (!provider || !model) {
    throw new LuziaConfigError(
      `No chat model configured. Pass \`chat\` to createLuziaHandler, or set the ${CHAT_PROVIDER_ENV} ` +
        `(${Object.keys(CHAT_PROVIDERS).join(' | ')}) and ${CHAT_MODEL_ENV} environment variables.`,
    );
  }
  return { provider: provider as ChatProvider, model };
}
