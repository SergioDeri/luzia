import type { CoreDraft, WizardContext } from '../context.ts';

/**
 * A way to produce the Owner's Core. The Core step offers every registered
 * source (and skips the choice when there is only one), runs the chosen one,
 * then shows the result and saves it after confirmation.
 */
export interface CoreSource {
  id: string;
  /** Shown in the choice, e.g. "Answer a few questions". */
  label: string;
  hint?: string;
  /**
   * Produces a Core, or `null` to go back to the choice of source (e.g. the
   * Owner declined sending their CV to the provider).
   */
  create(context: WizardContext): Promise<CoreDraft | null>;
}
