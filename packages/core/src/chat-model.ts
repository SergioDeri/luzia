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

/**
 * Built-in chat providers: display name, where the API key is read from, how a
 * model is made, and a few suggested model ids (any other id works too).
 */
export const CHAT_PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    suggestedModels: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    create: (apiKey: string, model: string) => createAnthropic({ apiKey })(model),
  },
  openai: {
    label: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    suggestedModels: ['gpt-5.5', 'gpt-5.4-mini'],
    create: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  },
  google: {
    label: 'Google (Gemini)',
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    suggestedModels: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    create: (apiKey: string, model: string) => createGoogle({ apiKey })(model),
  },
  groq: {
    label: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    suggestedModels: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    create: (apiKey: string, model: string) => createGroq({ apiKey })(model),
  },
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
