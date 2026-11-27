import type { CoreDraft, WizardContext } from '../context.ts';

/** A Core a source produced, before the Owner reviews it. */
export interface ProposedCore extends CoreDraft {
  /**
   * Produces a new draft from the same input (e.g. the CV drafted again),
   * for the Owner's "redo". Without it, redo starts again from the choice of source.
   */
  redo?(): Promise<ProposedCore>;
}

/**
 * A way to produce the Owner's Core. The Core step offers every registered
 * source (and skips the choice when there is only one), runs the chosen one,
 * then shows the result in full for the Owner to accept, edit or redo.
 */
export interface CoreSource {
  id: string;
  /** Shown in the choice, e.g. "Answer a few questions". */
  label: string;
  hint?: string;
  /**
   * Produces a Core, or `null` to go back to the choice of source (with a
   * single source, `null` ends the step without a Core).
   */
  create(context: WizardContext): Promise<ProposedCore | null>;
}
