import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompiledKnowledgeBase } from './compiled.ts';

/** Writes a compiled Knowledge Base as JSON, creating parent folders as needed. */
export async function writeCompiledKnowledgeBase(
  knowledgeBase: CompiledKnowledgeBase,
  outFile: string,
): Promise<void> {
  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(knowledgeBase, null, 2)}\n`, 'utf8');
}
