import { CORE_FILE_NAME } from '@luzia/core';
import type { CoreDraft, WizardContext } from '../context.ts';
import { coreSources, type CoreSource } from '../core-sources/index.ts';
import type { WizardStep } from '../step.ts';

export const KNOWLEDGE_BASE_DIR = 'knowledge-base';
export const CORE_PATH = `${KNOWLEDGE_BASE_DIR}/${CORE_FILE_NAME}`;

/** The Core: produced by one of the {@link coreSources}, shown in full and saved after confirmation. */
export const coreStep: WizardStep = {
  id: 'core',
  title: 'Core',
  async run(context) {
    context.say(
      'The Core is what the Agent always knows about you: a short summary, your contact details and the role you’re looking for.',
    );
    const core = await createCore(context);

    context.say('');
    context.say(`Your Core (${CORE_PATH}):`);
    context.say('');
    for (const line of core.text.trimEnd().split('\n')) context.say(line ? `  ${line}` : '');
    context.say('');

    context.state.core = core;
    const saved = await context.apply(
      { files: [{ path: CORE_PATH, content: core.text }, ...(core.files ?? [])] },
      'Save the Core to the Knowledge Base?',
    );
    if (!saved && (await context.readFile(CORE_PATH)) === null) {
      context.changes.todo.push(`Write your Core in ${CORE_PATH}`);
    }
  },
};

async function createCore(context: WizardContext): Promise<CoreDraft> {
  for (;;) {
    const source = await chooseSource(context);
    const core = await source.create(context);
    if (core) return core;
  }
}

async function chooseSource(context: WizardContext): Promise<CoreSource> {
  if (coreSources.length === 1) return coreSources[0]!;
  const id = await context.prompter.select({
    message: 'How do you want to write your Core?',
    options: coreSources.map((source) => ({ value: source.id, label: source.label, ...(source.hint ? { hint: source.hint } : {}) })),
  });
  return coreSources.find((source) => source.id === id)!;
}
