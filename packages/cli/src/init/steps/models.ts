import {
  CHAT_MODEL_ENV,
  CHAT_PROVIDER_ENV,
  CHAT_PROVIDERS,
  EMBEDDING_MODEL_ENV,
  EMBEDDING_PROVIDER_ENV,
  EMBEDDING_PROVIDERS,
  type ChatProvider,
  type EmbeddingProvider,
} from '@luzia/core';
import type { FileWrite, WizardContext } from '../context.ts';
import { gitignoreIgnores, mergeEnvFile } from '../env-file.ts';
import { required } from '../prompter.ts';
import type { WizardStep } from '../step.ts';

export const ENV_FILE = '.env.local';
const OTHER_MODEL = '__other__';

/** Chat and embeddings providers/models and their API keys, saved only to `.env.local`. */
export const modelsStep: WizardStep = {
  id: 'models',
  title: 'Models and keys',
  async run(context) {
    const { prompter } = context;

    const chatProvider = await prompter.select<ChatProvider>({
      message: 'Which chat provider should the Agent use?',
      options: entries(CHAT_PROVIDERS).map(([value, provider]) => ({ value, label: provider.label })),
    });
    const chatModel = await chooseModel(context, `Which ${CHAT_PROVIDERS[chatProvider].label} chat model?`, CHAT_PROVIDERS[chatProvider].suggestedModels);

    context.say(
      'The Knowledge Base is searched with an embeddings model, chosen separately from the chat model. ' +
        'Anthropic and Groq don’t offer embeddings, so pick OpenAI or Google (this may need a second API key).',
    );
    const embeddingProviders = entries(EMBEDDING_PROVIDERS);
    const embeddingProvider = await prompter.select<EmbeddingProvider>({
      message: 'Which embeddings provider?',
      options: embeddingProviders.map(([value, provider]) => ({ value, label: provider.label })),
      initialValue: embeddingProviders.find(([value]) => value === (chatProvider as string))?.[0] ?? 'openai',
    });
    const embeddingModel = await chooseModel(
      context,
      `Which ${EMBEDDING_PROVIDERS[embeddingProvider].label} embeddings model?`,
      EMBEDDING_PROVIDERS[embeddingProvider].suggestedModels,
    );

    const values: Record<string, string> = {
      [CHAT_PROVIDER_ENV]: chatProvider,
      [CHAT_MODEL_ENV]: chatModel,
      [EMBEDDING_PROVIDER_ENV]: embeddingProvider,
      [EMBEDDING_MODEL_ENV]: embeddingModel,
    };
    // One key per provider, even when chat and embeddings share it.
    const keys = new Map<string, string>([
      [CHAT_PROVIDERS[chatProvider].apiKeyEnv, CHAT_PROVIDERS[chatProvider].label],
      [EMBEDDING_PROVIDERS[embeddingProvider].apiKeyEnv, EMBEDDING_PROVIDERS[embeddingProvider].label],
    ]);
    for (const [name, label] of keys) {
      const key = (
        await prompter.secret({ message: `Your ${label} API key (saved to ${ENV_FILE} as ${name})`, validate: required('the API key') })
      ).trim();
      context.addSecret(key);
      values[name] = key;
    }

    context.state.models = {
      chat: { provider: chatProvider, model: chatModel },
      embedding: { provider: embeddingProvider, model: embeddingModel },
    };

    const files: FileWrite[] = [
      { path: ENV_FILE, content: mergeEnvFile((await context.readFile(ENV_FILE)) ?? '', values, 'luzIA: models and API keys (server-side only, never commit this file)') },
    ];
    const gitignore = await context.readFile('.gitignore');
    if (gitignore === null || !gitignoreIgnores(gitignore, ENV_FILE)) {
      files.push({ path: '.gitignore', content: `${gitignore ? `${gitignore.replace(/\n?$/, '\n')}\n` : ''}# Local environment (API keys)\n${ENV_FILE}\n` });
    }

    context.say(`Variables for ${ENV_FILE}: ${Object.keys(values).join(', ')}.`);
    if (await context.apply({ files }, `Save these settings to ${ENV_FILE}?`)) {
      context.state.envValues = { ...context.state.envValues, ...values };
    } else {
      context.changes.todo.push(`Set ${Object.keys(values).join(', ')} in ${ENV_FILE}`);
    }
  },
};

async function chooseModel(context: WizardContext, message: string, suggested: readonly string[]): Promise<string> {
  const choice = await context.prompter.select({
    message,
    options: [
      ...suggested.map((model) => ({ value: model, label: model })),
      { value: OTHER_MODEL, label: 'Another model id…' },
    ],
    initialValue: suggested[0],
  });
  if (choice !== OTHER_MODEL) return choice;
  return (await context.prompter.text({ message: 'Model id', validate: required('a model id') })).trim();
}

function entries<T extends Record<string, unknown>>(record: T): [keyof T & string, T[keyof T]][] {
  return Object.entries(record) as [keyof T & string, T[keyof T]][];
}
