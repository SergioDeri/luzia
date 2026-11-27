import { createWizardContext, type WizardContext, type WizardIo } from './context.ts';
import { detectProject, execCommand, runScriptCommand } from './project.ts';
import { WizardCancelledError } from './prompter.ts';
import type { WizardStep } from './step.ts';
import { wizardSteps } from './steps/index.ts';

/** Runs `luzia init`: every step in order, then a summary. Resolves to the exit code. */
export async function runInitWizard(io: WizardIo, steps: WizardStep[] = wizardSteps): Promise<number> {
  const context = createWizardContext(io, await detectProject(io.cwd));

  try {
    const shown = steps.filter((step) => step.title);
    let shownSoFar = 0;
    for (const step of steps) {
      if (step.applies && !step.applies(context)) continue;
      if (step.title) {
        shownSoFar++;
        const total = shown.filter((candidate) => !candidate.applies || candidate.applies(context)).length;
        context.say('');
        context.say(`Step ${shownSoFar} of ${Math.max(total, shownSoFar)}: ${step.title}`);
      }
      await step.run(context);
    }
  } catch (error) {
    if (error instanceof WizardCancelledError) {
      context.say('');
      context.say('Setup cancelled. Nothing else was changed.');
      printChanges(context);
      return 1;
    }
    throw new Error(context.redact(error instanceof Error ? error.message : String(error)));
  }

  printSummary(context);
  return context.changes.failed ? 1 : 0;
}

function printChanges(context: WizardContext): void {
  const { created, updated, commands } = context.changes;
  if (created.length + updated.length + commands.length === 0) return;
  if (created.length) context.say(`  Created: ${created.join(', ')}`);
  if (updated.length) context.say(`  Updated: ${updated.join(', ')}`);
  if (commands.length) context.say(`  Ran: ${commands.join('; ')}`);
}

function printSummary(context: WizardContext): void {
  const manager = context.state.project.packageManager;
  const luzia = execCommand(manager, 'luzia');
  context.say('');
  context.say('Summary');
  printChanges(context);
  if (context.changes.todo.length) {
    context.say('  Still to do:');
    for (const todo of context.changes.todo) context.say(`  - ${todo}`);
  }
  context.say('');
  context.say('Next steps');
  for (const step of [
    `Start the dev server with ${runScriptCommand(manager, 'dev')} and ask the Agent about yourself.`,
    `After changing files in knowledge-base/, run ${luzia} build again.`,
    ...context.changes.next,
    `Check the Agent’s answers with ${luzia} eval (see ${luzia} help for the eval file format).`,
  ]) {
    context.say(`  - ${step}`);
  }
}
