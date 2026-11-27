import type { WizardStep } from '../step.ts';

/**
 * Instructions: how the Agent handles sensitive topics (salary, availability,
 * relocation, free text), saved as `knowledge-base/instructions.md`. Not asked
 * yet, so it doesn't run.
 */
export const instructionsStep: WizardStep = {
  id: 'instructions',
  title: 'Instructions',
  applies: () => false,
  async run() {},
};
