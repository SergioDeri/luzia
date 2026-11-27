import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Env } from './env.ts';
import { LuziaConfigError } from './errors.ts';
import { providerModelFromEnv, resolveProviderModel, type ProviderModelConfig } from './providers.ts';

/** A ready-made AI SDK language model (any provider). */
export type ChatModelInstance = Exclude<LanguageModel, string>;

export const CHAT_PROVIDERS = {
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', create: (apiKey: string, model: string) => createAnthropic({ apiKey })(model) },
  openai: { apiKeyEnv: 'OPENAI_API_KEY', create: (apiKey: string, model: string) => createOpenAI({ apiKey })(model) },
  google: {
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    create: (apiKey: string, model: string) => createGoogle({ apiKey })(model),
  },
  groq: { apiKeyEnv: 'GROQ_API_KEY', create: (apiKey: string, model: string) => createGroq({ apiKey })(model) },
} as const;

export type ChatProvider = keyof typeof CHAT_PROVIDERS;

/**
 * How the Agent's chat model is chosen. Either a built-in provider by name
 * (API key read server-side from the provider's environment variable unless
 * given), or any AI SDK language model instance.
 */
export type ChatModelConfig = ProviderModelConfig<ChatProvider, ChatModelInstance>;

/** Environment variables used when `chat` is omitted from the handler config. */
export const CHAT_PROVIDER_ENV = 'LUZIA_CHAT_PROVIDER';
export const CHAT_MODEL_ENV = 'LUZIA_CHAT_MODEL';

export function resolveChatModel(config: ChatModelConfig | undefined, env: Env): ChatModelInstance {
  return resolveProviderModel<ChatModelInstance>(
    {
      configKey: 'chat',
      label: 'chat',
      instanceDescription: 'an AI SDK language model',
      providers: CHAT_PROVIDERS,
    },
    config ?? chatModelConfigFromEnv(env),
    env,
  );
}

function chatModelConfigFromEnv(env: Env): { provider: string; model: string } {
  const fromEnv = providerModelFromEnv(env, CHAT_PROVIDER_ENV, CHAT_MODEL_ENV);
  if (!fromEnv) {
    throw new LuziaConfigError(
      `No chat model configured. Pass \`chat\` to createLuziaHandler, or set the ${CHAT_PROVIDER_ENV} ` +
        `(${Object.keys(CHAT_PROVIDERS).join(' | ')}) and ${CHAT_MODEL_ENV} environment variables.`,
    );
  }
  return fromEnv;
}
