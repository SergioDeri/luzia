import type { WizardStep } from '../step.ts';

/**
 * Widget options (contact from the Core, greeting, suggested questions, theme,
 * mode), recorded in `context.state.widget` for the integration step. Not
 * asked yet, so it doesn't run.
 */
export const widgetStep: WizardStep = {
  id: 'widget',
  title: 'Widget',
  applies: () => false,
  async run() {},
};
