import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { embedMany } from 'ai';
import { serverEnv, type Env } from '../env.ts';
import {
  EMBEDDING_MODEL_ENV,
  EMBEDDING_PROVIDER_ENV,
  resolveEmbeddingModel,
  type EmbeddingModelConfig,
} from '../embedding-model.ts';
import { KnowledgeBaseError } from '../errors.ts';
import {
  COMPILED_KNOWLEDGE_BASE_FORMAT,
  type CompiledKnowledgeBase,
  type KnowledgeBaseChunk,
  type KnowledgeBaseDocument,
} from './compiled.ts';
import { SOURCE_READERS, type SourceSection } from './sources.ts';
import { DEFAULT_MAX_CHUNK_CHARS, splitSection } from './split.ts';

/** File names (case-insensitive) that identify the Core and the Instructions. */
export const CORE_FILE_NAME = 'core.md';
export const INSTRUCTIONS_FILE_NAME = 'instructions.md';

export interface BuildKnowledgeBaseOptions {
  /** The Knowledge Base folder. */
  dir: string;
  /**
   * The embeddings model chunks are embedded with. When omitted it is read from
   * the LUZIA_EMBEDDING_PROVIDER and LUZIA_EMBEDDING_MODEL environment
   * variables. Only required when the folder has files besides Core and Instructions.
   */
  embedding?: EmbeddingModelConfig;
  /** Where embeddings settings and API keys are read from. Defaults to `process.env`. */
  env?: Env;
  /** Sections longer than this many characters are split into several chunks. */
  maxChunkChars?: number;
}

/** A summary of what a build compiled, for the Owner. */
export interface KnowledgeBaseBuildReport {
  /** Every file compiled (Core and Instructions included), relative to the Knowledge Base folder. */
  files: string[];
  /** Retrievable chunks produced. */
  chunks: number;
  /** Pages whose text was extracted from PDF files. */
  pdfPages: number;
  /** Problems the Owner should fix, e.g. a PDF with no extractable text. They do not fail the build. */
  warnings: string[];
}

export interface KnowledgeBaseBuildResult {
  knowledgeBase: CompiledKnowledgeBase;
  report: KnowledgeBaseBuildReport;
}

/**
 * Compiles a Knowledge Base folder into a {@link CompiledKnowledgeBase}.
 * Throws a {@link KnowledgeBaseError} when the folder or its Core file is missing.
 * Use {@link buildKnowledgeBaseWithReport} to also get a summary of the build.
 */
export async function buildKnowledgeBase(options: BuildKnowledgeBaseOptions): Promise<CompiledKnowledgeBase> {
  return (await buildKnowledgeBaseWithReport(options)).knowledgeBase;
}

/** Like {@link buildKnowledgeBase}, also reporting files processed, chunks produced, PDF pages and warnings. */
export async function buildKnowledgeBaseWithReport(options: BuildKnowledgeBaseOptions): Promise<KnowledgeBaseBuildResult> {
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

  const content = await readRetrievableContent(dir, fileNames, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS);
  const { chunks, embeddingModel } = await embedPieces(content.pieces, options);

  return {
    knowledgeBase: { format: COMPILED_KNOWLEDGE_BASE_FORMAT, core, instructions, chunks, embeddingModel },
    report: {
      files: [core.source, ...(instructions ? [instructions.source] : []), ...content.files],
      chunks: chunks.length,
      pdfPages: content.pdfPages,
      warnings: content.warnings,
    },
  };
}

type ChunkPiece = Omit<KnowledgeBaseChunk, 'vector'>;

interface RetrievableContent {
  pieces: ChunkPiece[];
  /** Files read, in build order. */
  files: string[];
  pdfPages: number;
  warnings: string[];
}

/** Reads every file other than Core and Instructions into size-limited chunks (without vectors yet). */
async function readRetrievableContent(dir: string, fileNames: string[], maxChars: number): Promise<RetrievableContent> {
  const reserved = [CORE_FILE_NAME, INSTRUCTIONS_FILE_NAME];
  const content: RetrievableContent = { pieces: [], files: [], pdfPages: 0, warnings: [] };

  for (const source of [...fileNames].sort()) {
    if (reserved.includes(source.toLowerCase())) continue;
    const reader = SOURCE_READERS.find((candidate) => candidate.accepts(source));
    if (!reader) continue;

    const result = await reader.read(path.join(dir, source));
    content.files.push(source);
    content.pdfPages += result.pages ?? 0;
    content.warnings.push(...(result.warnings ?? []));
    for (const section of result.sections.flatMap((s) => splitSection(s, maxChars))) {
      content.pieces.push({ source, headings: section.headings, text: chunkText(section) });
    }
  }
  return content;
}

/** The chunk text starts with its heading path, so both the embedder and the Agent see where it comes from. */
function chunkText({ headings, text }: SourceSection): string {
  return headings.length > 0 ? `${headings.join(' > ')}\n\n${text}` : text;
}

async function embedPieces(
  pieces: ChunkPiece[],
  options: BuildKnowledgeBaseOptions,
): Promise<Pick<CompiledKnowledgeBase, 'chunks' | 'embeddingModel'>> {
  if (pieces.length === 0) return { chunks: [], embeddingModel: null };

  const embedding = resolveEmbeddingModel(options.embedding, serverEnv(options.env));
  if (!embedding) {
    const sources = [...new Set(pieces.map((piece) => piece.source))].join(', ');
    throw new KnowledgeBaseError(
      `The Knowledge Base has retrievable content (${sources}) but no embeddings model is configured. ` +
        `Set ${EMBEDDING_PROVIDER_ENV} (openai | google) and ${EMBEDDING_MODEL_ENV} with the provider's API key, ` +
        'or pass `embedding` to buildKnowledgeBase.',
    );
  }

  const { embeddings } = await embedMany({ model: embedding.model, values: pieces.map((piece) => piece.text) });
  return {
    chunks: pieces.map((piece, i) => ({ ...piece, vector: embeddings[i]! })),
    embeddingModel: embedding.id,
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
