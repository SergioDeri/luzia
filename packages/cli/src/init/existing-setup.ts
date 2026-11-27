import { readdir } from 'node:fs/promises';
import path from 'node:path';
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
import type { CoreDraft, ModelChoices, WizardContext } from './context.ts';
import { parseCore } from './core-sources/index.ts';
import { readEnvFile } from './env-file.ts';
import { CORE_PATH, KNOWLEDGE_BASE_DIR } from './steps/core.ts';
import { INSTRUCTIONS_PATH } from './steps/instructions.ts';
import { ENV_FILE } from './steps/models.ts';
import { findLayout, routePath } from './steps/nextjs.ts';
import { readAllowedOrigins, STANDALONE_FUNCTION } from './steps/standalone.ts';
import { readReactWidget, type WidgetProps } from './widget-snippet.ts';

/** What an earlier `luzia init` (or the Owner) already set up in the project. */
export interface ExistingSetup {
  /** The Core in the Knowledge Base, with the name and contact it states. */
  core: CoreDraft;
  /** The Instructions markdown, `null` when there is none. */
  instructions: string | null;
  /** Other Knowledge Base files (e.g. the CV), relative to the project. */
  otherFiles: string[];
  /** luzIA variables in `.env.local` (secrets included), by name. */
  env: Record<string, string>;
  /** The models `.env.local` configures, `null` when incomplete. */
  models: ModelChoices | null;
  /** The server route, when there is one. */
  route: string | null;
  /** The file the widget is in, when it was found. */
  widget: string | null;
  /** The standalone server's function file and the origins it allows (`null` when they can't be read), when there is one. */
  server: { path: string; origins: string[] | null } | null;
  /** The widget options that could be read back from where the widget is (`{}` when none). */
  widgetOptions: Partial<WidgetProps>;
}

/**
 * Reads the existing luzIA setup. There is one once the Knowledge Base has a
 * Core: everything else (variables, route, widget) is reported as found.
 * `null` when there is no Core, so the first-run flow runs.
 */
export async function readExistingSetup(context: WizardContext): Promise<ExistingSetup | null> {
  const coreText = await context.readFile(CORE_PATH);
  if (coreText === null) return null;

  const allEnv = readEnvFile((await context.readFile(ENV_FILE)) ?? '');
  const models = modelsFrom(allEnv);
  const keyNames: string[] = models
    ? [CHAT_PROVIDERS[models.chat.provider].apiKeyEnv, EMBEDDING_PROVIDERS[models.embedding.provider].apiKeyEnv]
    : [...Object.values(CHAT_PROVIDERS), ...Object.values(EMBEDDING_PROVIDERS)].map((provider) => provider.apiKeyEnv);
  // In the order the models step writes them (the file's own order isn't kept by the parser).
  const modelNames = [CHAT_PROVIDER_ENV, CHAT_MODEL_ENV, EMBEDDING_PROVIDER_ENV, EMBEDDING_MODEL_ENV];
  const names = [
    ...modelNames,
    ...Object.keys(allEnv).filter((name) => name.startsWith('LUZIA_') && !modelNames.includes(name)).sort(),
    ...new Set(keyNames),
  ];
  const env = Object.fromEntries(names.filter((name) => allEnv[name]).map((name) => [name, allEnv[name]!]));

  return {
    core: { text: coreText, ...parseCore(coreText) },
    instructions: await context.readFile(INSTRUCTIONS_PATH),
    otherFiles: await otherKnowledgeBaseFiles(context.cwd),
    env,
    models,
    ...(await integration(context)),
  };
}

/** Puts the existing setup in the wizard state, so a section changed alone builds on the rest. */
export function useExistingSetup(context: WizardContext, setup: ExistingSetup): void {
  for (const [name, value] of Object.entries(setup.env)) if (!name.startsWith('LUZIA_')) context.addSecret(value);
  context.state.envValues = { ...setup.env };
  if (setup.models) context.state.models = setup.models;
  context.state.core = setup.core;
  if (setup.instructions !== null) context.state.instructions = setup.instructions;
  const { endpoint: _endpoint, contact: _contact, ...widget } = setup.widgetOptions;
  if (Object.keys(widget).length) context.state.widget = { contact: setup.core.contact, ...widget };
}

function modelsFrom(env: Record<string, string>): ModelChoices | null {
  const chatProvider = env[CHAT_PROVIDER_ENV];
  const embeddingProvider = env[EMBEDDING_PROVIDER_ENV];
  const chatModel = env[CHAT_MODEL_ENV];
  const embeddingModel = env[EMBEDDING_MODEL_ENV];
  if (!chatProvider || !(chatProvider in CHAT_PROVIDERS) || !chatModel) return null;
  if (!embeddingProvider || !(embeddingProvider in EMBEDDING_PROVIDERS) || !embeddingModel) return null;
  return {
    chat: { provider: chatProvider as ChatProvider, model: chatModel },
    embedding: { provider: embeddingProvider as EmbeddingProvider, model: embeddingModel },
  };
}

async function otherKnowledgeBaseFiles(cwd: string): Promise<string[]> {
  const entries = await readdir(path.join(cwd, KNOWLEDGE_BASE_DIR), { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(cwd, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => file !== CORE_PATH && file !== INSTRUCTIONS_PATH)
    .sort();
}

/** The server route and the widget in the project, for a Next.js app; the standalone server otherwise. */
async function integration(
  context: WizardContext,
): Promise<Pick<ExistingSetup, 'route' | 'widget' | 'server' | 'widgetOptions'>> {
  const { project } = context.state;
  if (project.kind !== 'nextjs') {
    const source = await context.readFile(STANDALONE_FUNCTION);
    const server = source === null ? null : { path: STANDALONE_FUNCTION, origins: readAllowedOrigins(source) };
    return { route: null, widget: null, server, widgetOptions: {} };
  }
  let route: string | null = null;
  for (const extension of ['ts', 'js'] as const) {
    if ((await context.readFile(routePath(project, extension))) !== null) route = route ?? routePath(project, extension);
  }
  const layout = await findLayout(context);
  const widgetOptions = layout.content === null ? null : readReactWidget(layout.content);
  return { route, widget: widgetOptions ? layout.path : null, server: null, widgetOptions: widgetOptions ?? {} };
}
