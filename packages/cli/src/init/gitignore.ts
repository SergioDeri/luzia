import type { FileWrite, WizardContext } from './context.ts';
import { gitignoreIgnores } from './env-file.ts';

/** An entry `.gitignore` must have, with the comment written above it. */
export interface IgnoreEntry {
  entry: string;
  comment: string;
}

/** The `.gitignore` write that adds the entries not already ignored, or nothing when all are. */
export async function gitignoreWith(context: WizardContext, entries: IgnoreEntry[]): Promise<FileWrite[]> {
  const gitignore = await context.readFile('.gitignore');
  const missing = entries.filter(
    ({ entry }) => gitignore === null || !gitignoreIgnores(gitignore, entry.replace(/\/$/, '')),
  );
  if (missing.length === 0) return [];
  const before = gitignore ? `${gitignore.replace(/\n?$/, '\n')}\n` : '';
  const added = missing.map(({ entry, comment }) => `# ${comment}\n${entry}\n`).join('\n');
  return [{ path: '.gitignore', content: `${before}${added}` }];
}
