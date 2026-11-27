import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeBaseError } from '../errors.ts';
import {
  COMPILED_KNOWLEDGE_BASE_FORMAT,
  type CompiledKnowledgeBase,
  type KnowledgeBaseDocument,
} from './compiled.ts';

/** File names (case-insensitive) that identify the Core and the Instructions. */
export const CORE_FILE_NAME = 'core.md';
export const INSTRUCTIONS_FILE_NAME = 'instructions.md';

export interface BuildKnowledgeBaseOptions {
  /** The Knowledge Base folder. */
  dir: string;
}

/**
 * Compiles a Knowledge Base folder into a {@link CompiledKnowledgeBase}.
 * Throws a {@link KnowledgeBaseError} when the folder or its Core file is missing.
 */
export async function buildKnowledgeBase(
  options: BuildKnowledgeBaseOptions,
): Promise<CompiledKnowledgeBase> {
  const dir = path.resolve(options.dir);
  const fileNames = await listFiles(dir);

  const core = await readNamedFile(dir, fileNames, CORE_FILE_NAME);
  if (!core) {
    throw new KnowledgeBaseError(
      `No Core file found in the Knowledge Base folder ${dir}. ` +
        `Create a "${CORE_FILE_NAME}" file there with the Owner's summary, contact details and role sought.`,
    );
  }
  const instructions = await readNamedFile(dir, fileNames, INSTRUCTIONS_FILE_NAME);

  return {
    format: COMPILED_KNOWLEDGE_BASE_FORMAT,
    core,
    instructions,
    chunks: [],
    embeddingModel: null,
  };
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new KnowledgeBaseError(`Knowledge Base folder not found: ${dir}`);
    }
    throw error;
  }
}

async function readNamedFile(
  dir: string,
  fileNames: string[],
  wanted: string,
): Promise<KnowledgeBaseDocument | null> {
  const source = fileNames.find((name) => name.toLowerCase() === wanted);
  if (!source) return null;
  const text = (await readFile(path.join(dir, source), 'utf8')).trim();
  return { source, text };
}
