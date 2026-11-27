import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as clack from '@clack/prompts';
import { WizardCancelledError, type Prompter, type SelectPrompt, type Validate } from './prompter.ts';

/** The real {@link Prompter}, drawn in the terminal with @clack/prompts. Secrets are masked, never echoed. */
export function createTerminalPrompter(env: Record<string, string | undefined> = process.env): Prompter {
  return {
    async text(options) {
      return answered(
        await clack.text({
          message: options.message,
          ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
          ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
          ...(options.validate ? { validate: adapt(options.validate, options.defaultValue) } : {}),
        }),
      );
    },
    async secret(options) {
      return answered(
        await clack.password({
          message: options.message,
          ...(options.validate ? { validate: adapt(options.validate) } : {}),
        }),
      );
    },
    async select<Value extends string>(options: SelectPrompt<Value>) {
      const value = answered(
        await clack.select<string>({
          message: options.message,
          options: options.options.map((option) => ({
            value: option.value,
            label: option.label,
            ...(option.hint ? { hint: option.hint } : {}),
          })),
          ...(options.initialValue !== undefined ? { initialValue: options.initialValue } : {}),
        }),
      );
      return value as Value;
    },
    async confirm(options) {
      return answered(
        await clack.confirm({
          message: options.message,
          ...(options.initialValue !== undefined ? { initialValue: options.initialValue } : {}),
        }),
      );
    },
    async editor(options) {
      const editor = env.VISUAL || env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
      answered(await clack.confirm({ message: `${options.message} Open it in ${editor}?`, initialValue: true }));
      const dir = await mkdtemp(path.join(tmpdir(), 'luzia-'));
      const file = path.join(dir, `edit${options.extension ?? '.md'}`);
      try {
        await writeFile(file, options.initialValue);
        const result = spawnSync(editor, [file], { stdio: 'inherit', shell: process.platform === 'win32' });
        if (result.error || result.status !== 0) {
          throw new Error(`Could not open ${editor}. Set the EDITOR environment variable to your editor's command.`);
        }
        return await readFile(file, 'utf8');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

function answered<T>(value: T): Exclude<T, symbol> {
  if (clack.isCancel(value)) throw new WizardCancelledError();
  return value as Exclude<T, symbol>;
}

function adapt(validate: Validate, defaultValue?: string) {
  return (value: string | undefined) => {
    const answer = value ?? '';
    return answer === '' && defaultValue !== undefined ? undefined : validate(answer);
  };
}
