import { CORE_FILE_NAME } from 'luzia-core';
import { ALREADY_CONFIRMED, type WizardContext } from '../context.ts';
import { coreSources, parseCore, type CoreSource, type ProposedCore } from '../core-sources/index.ts';
import type { WizardStep } from '../step.ts';

export const KNOWLEDGE_BASE_DIR = 'knowledge-base';
export const CORE_PATH = `${KNOWLEDGE_BASE_DIR}/${CORE_FILE_NAME}`;

/**
 * The Core: produced by one of the {@link coreSources}, shown in full, and
 * saved only once the Owner accepts it or edits it in their editor (or redone).
 */
export const coreStep: WizardStep = {
  id: 'core',
  title: 'Core',
  async run(context) {
    context.say(
      'The Core is what the Agent always knows about you: a short summary, your contact details and the role you’re looking for.',
    );
    let core = await createCore(context);

    while (core) {
      showCore(context, core);
      const choice = await context.prompter.select({
        message: 'Save the Core to the Knowledge Base?',
        options: [
          { value: 'accept', label: 'Yes, save it' },
          { value: 'edit', label: 'Edit it in your editor, then save it' },
          { value: 'redo', label: core.redo ? 'Draft it again' : 'Start over' },
        ],
      });
      if (choice === 'accept') break;
      if (choice === 'edit') {
        const edited = await context.prompter.editor({ message: 'Edit your Core', initialValue: core.text, extension: '.md' });
        if (edited.trim()) {
          // The name and contact later steps use are the ones the edited text states.
          const text = `${edited.trim()}\n`;
          const stated = parseCore(text);
          core = { ...core, text, ownerName: stated.ownerName || core.ownerName, contact: stated.contact };
          break;
        }
        context.warn('The edited Core was empty, so the draft was kept.');
        continue;
      }
      core = core.redo ? await core.redo() : await createCore(context);
    }

    if (!core) {
      context.changes.todo.push(`Write your Core in ${CORE_PATH}`);
      return;
    }
    const { redo: _redo, ...draft } = core;
    // Accepting the Core shown in full is the confirmation, unless it replaces one already saved (a re-run):
    // then the Owner confirms again after seeing the diff.
    const replacing = (await context.readFile(CORE_PATH)) !== null;
    const files = [{ path: CORE_PATH, content: draft.text }, ...(draft.files ?? [])];
    if (replacing && !(await context.apply({ files }, 'Replace your current Core with this one?'))) return;
    if (!replacing) await context.apply({ files }, ALREADY_CONFIRMED);
    context.state.core = draft;
  },
};

function showCore(context: WizardContext, core: ProposedCore): void {
  context.say('');
  context.say(`Your Core (${CORE_PATH}):`);
  context.say('');
  for (const line of core.text.trimEnd().split('\n')) context.say(line ? `  ${line}` : '');
  context.say('');
  for (const file of core.files ?? []) context.say(`${file.path} will be added to the Knowledge Base too.`);
}

/** Runs the chosen source; `null` when the only source produced nothing. */
async function createCore(context: WizardContext): Promise<ProposedCore | null> {
  for (;;) {
    const source = await chooseSource(context);
    const core = await source.create(context);
    if (core) return core;
    if (coreSources.length === 1) return null;
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
