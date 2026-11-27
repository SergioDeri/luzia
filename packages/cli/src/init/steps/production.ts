import type { WizardStep } from '../step.ts';

/**
 * Production variables: upload the luzIA variables to Vercel, or list them
 * for the hosting dashboard. Not offered yet, so it doesn't run.
 */
export const productionStep: WizardStep = {
  id: 'production',
  title: 'Production variables',
  applies: () => false,
  async run() {},
};
