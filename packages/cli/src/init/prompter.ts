/**
 * How `luzia init` asks the Owner questions. The wizard depends only on this
 * interface; the binary backs it with a terminal prompt library and tests use
 * a scripted one. Every method throws {@link WizardCancelledError} when the
 * Owner cancels (Ctrl+C).
 */
export interface Prompter {
  /** A single line of text. */
  text(options: TextPrompt): Promise<string>;
  /** A secret (e.g. an API key), typed without being echoed. */
  secret(options: SecretPrompt): Promise<string>;
  /** One choice out of a list. */
  select<Value extends string>(options: SelectPrompt<Value>): Promise<Value>;
  /** A yes/no question. */
  confirm(options: ConfirmPrompt): Promise<boolean>;
  /** Multi-line text, edited in the Owner's editor, starting from `initialValue`. */
  editor(options: EditorPrompt): Promise<string>;
}

/** Returns an error message for an invalid answer, or `undefined` to accept it. */
export type Validate = (value: string) => string | undefined;

export interface TextPrompt {
  message: string;
  placeholder?: string;
  /** Answer used when the Owner submits nothing. */
  defaultValue?: string;
  validate?: Validate;
}

export interface SecretPrompt {
  message: string;
  validate?: Validate;
}

export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
  hint?: string;
}

export interface SelectPrompt<Value extends string> {
  message: string;
  options: SelectOption<Value>[];
  initialValue?: Value;
}

export interface ConfirmPrompt {
  message: string;
  initialValue?: boolean;
}

export interface EditorPrompt {
  message: string;
  initialValue: string;
  /** File extension of the temporary file opened in the editor, e.g. `.md`. */
  extension?: string;
}

/** Thrown by a {@link Prompter} when the Owner cancels the wizard. */
export class WizardCancelledError extends Error {
  constructor() {
    super('Setup cancelled.');
    this.name = 'WizardCancelledError';
  }
}

/** A validator that rejects an empty answer. */
export function required(what: string): Validate {
  return (value) => (value.trim() ? undefined : `Please enter ${what}.`);
}
