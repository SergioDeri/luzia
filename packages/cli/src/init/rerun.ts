import { CHAT_PROVIDERS, EMBEDDING_MODEL_ENV, EMBEDDING_PROVIDER_ENV, EMBEDDING_PROVIDERS } from '@luzia/core';
import type { WizardContext } from './context.ts';
import { useExistingSetup, type ExistingSetup } from './existing-setup.ts';
import type { WizardStep } from './step.ts';
import { buildStep } from './steps/build.ts';
import { coreStep, KNOWLEDGE_BASE_DIR } from './steps/core.ts';
import { instructionsStep } from './steps/instructions.ts';
import { ENV_FILE, modelsStep } from './steps/models.ts';
import { nextjsWidgetStep } from './steps/nextjs.ts';
import { productionStep } from './steps/production.ts';
import { standaloneOriginsStep, standaloneWidgetStep } from './steps/standalone.ts';
import { widgetStep } from './steps/widget.ts';

type SectionId = 'models' | 'core' | 'instructions' | 'widget' | 'origins' | 'production';

/** One entry of the re-run menu: the steps it runs, and nothing else. */
interface Section {
  id: SectionId;
  label: string;
  steps: WizardStep[];
}

/** The menu for this project: the allowed origins only for a standalone server that exists. */
function sectionsFor(setup: ExistingSetup): Section[] {
  return [
    { id: 'models', label: 'Models and keys', steps: [modelsStep] },
    { id: 'core', label: 'Core', steps: [coreStep] },
    { id: 'instructions', label: 'Instructions', steps: [instructionsStep] },
    { id: 'widget', label: 'Widget', steps: [widgetStep, nextjsWidgetStep, standaloneWidgetStep] },
    ...(setup.server ? [{ id: 'origins' as const, label: 'Allowed origins of the server', steps: [standaloneOriginsStep] }] : []),
    { id: 'production', label: 'Production variables', steps: [productionStep] },
  ];
}

const DONE = 'done';

/**
 * `luzia init` on a project that is already set up: shows what is configured,
 * then lets the Owner change one section at a time (as often as they like)
 * until they are done. Every other section is left as it is. The Knowledge
 * Base is rebuilt after a section that changed it or the embeddings model.
 */
export async function runRerunMenu(context: WizardContext, setup: ExistingSetup): Promise<void> {
  useExistingSetup(context, setup);
  printSetup(context, setup);
  const sections = sectionsFor(setup);

  for (;;) {
    context.say('');
    const choice = await context.prompter.select<SectionId | typeof DONE>({
      message: 'What do you want to change?',
      options: [
        ...sections.map((section) => ({ value: section.id, label: section.label })),
        { value: DONE, label: 'Nothing else, I’m done' },
      ],
      initialValue: DONE,
    });
    if (choice === DONE) return;
    await runSection(context, sections.find((section) => section.id === choice)!);
  }
}

async function runSection(context: WizardContext, section: Section): Promise<void> {
  context.say('');
  context.say(section.label);
  const embeddingBefore = embeddingSetting(context);
  const writtenBefore = written(context);

  for (const step of section.steps) {
    if (step.applies && !step.applies(context)) {
      if (step === productionStep) context.say(`There are no luzIA variables in ${ENV_FILE} to set for production yet.`);
      continue;
    }
    await step.run(context);
  }

  const changedKnowledgeBase = writtenSince(context, writtenBefore).some((file) => file.startsWith(`${KNOWLEDGE_BASE_DIR}/`));
  const changedEmbeddings = embeddingSetting(context) !== embeddingBefore;
  if (changedKnowledgeBase || changedEmbeddings) {
    if (changedEmbeddings) {
      context.say('The embeddings model changed, so the Knowledge Base is rebuilt with it (the server refuses a mismatch).');
    }
    await buildStep.run(context);
  }
}

/** How many files had been created and updated, to tell later which ones a section wrote. */
function written(context: WizardContext): { created: number; updated: number } {
  return { created: context.changes.created.length, updated: context.changes.updated.length };
}

function writtenSince(context: WizardContext, before: { created: number; updated: number }): string[] {
  return [...context.changes.created.slice(before.created), ...context.changes.updated.slice(before.updated)];
}

function embeddingSetting(context: WizardContext): string {
  const env = context.state.envValues;
  return `${env[EMBEDDING_PROVIDER_ENV] ?? ''}:${env[EMBEDDING_MODEL_ENV] ?? ''}`;
}

function printSetup(context: WizardContext, setup: ExistingSetup): void {
  const { project } = context.state;
  context.say('luzIA is already set up in this project. Here is what is configured:');
  context.say('');
  const core = [setup.core.ownerName, setup.core.contact && `contact ${setup.core.contact}`].filter(Boolean).join(', ');
  context.say(`  Core: ${KNOWLEDGE_BASE_DIR}/core.md${core ? ` (${core})` : ''}`);
  context.say(`  Instructions: ${setup.instructions === null ? 'none yet' : `${KNOWLEDGE_BASE_DIR}/instructions.md`}`);
  if (setup.otherFiles.length) context.say(`  Other Knowledge Base files: ${setup.otherFiles.join(', ')}`);
  if (setup.models) {
    const { chat, embedding } = setup.models;
    context.say(`  Chat model: ${CHAT_PROVIDERS[chat.provider].label}, ${chat.model}`);
    context.say(`  Embeddings model: ${EMBEDDING_PROVIDERS[embedding.provider].label}, ${embedding.model}`);
  } else {
    context.say(`  Models: not fully set in ${ENV_FILE}`);
  }
  const keys = Object.keys(setup.env).filter((name) => !name.startsWith('LUZIA_'));
  context.say(`  API keys in ${ENV_FILE}: ${keys.length ? `${keys.join(', ')} (values hidden)` : 'none'}`);
  if (project.kind === 'nextjs') {
    context.say(`  Route: ${setup.route ?? 'not found'}`);
    context.say(`  Widget: ${setup.widget ? `in ${setup.widget}` : 'not found in the root layout'}`);
  } else if (setup.server) {
    const origins = setup.server.origins ? setup.server.origins.join(', ') : 'not readable';
    context.say(`  Server: ${setup.server.path} (allowed origins: ${origins})`);
    context.say(`  Widget: ${setup.widget ? `in ${setup.widget}` : 'not in this folder (it goes in your portfolio’s HTML)'}`);
  } else {
    context.say('  Server: not set up yet');
  }
}
