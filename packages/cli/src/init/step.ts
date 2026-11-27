import type { WizardContext } from './context.ts';

/**
 * One step of `luzia init`. A step gathers the Owner's answers, records what
 * later steps need in `context.state`, and changes the project only through
 * `context.apply`, which shows the change and asks first. Cancelling before
 * that confirmation leaves the step's files untouched.
 */
export interface WizardStep {
  id: string;
  /** Shown as the progress heading, e.g. "Step 2 of 5: Models and keys". Steps without one run silently. */
  title?: string;
  /** Whether the step runs for this project and state. Defaults to always. */
  applies?(context: WizardContext): boolean;
  /** Said when the step is picked from the re-run menu but doesn't apply, e.g. why there is nothing to do. */
  notApplicableMessage?: string;
  run(context: WizardContext): Promise<void>;
}
