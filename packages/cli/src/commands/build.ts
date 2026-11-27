import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildKnowledgeBaseWithReport, writeCompiledKnowledgeBase } from '@luzia/core';
import type { CliCommand } from '../command.ts';

export const DEFAULT_KNOWLEDGE_BASE_DIR = 'knowledge-base';
export const DEFAULT_ARTIFACT_PATH = '.luzia/knowledge-base.json';

export const buildCommand: CliCommand = {
  summary: 'Compile a Knowledge Base folder into a single artifact for the luzIA server.',
  usage: `luzia build [--dir <folder>] [--out <file>]   (defaults: ${DEFAULT_KNOWLEDGE_BASE_DIR}, ${DEFAULT_ARTIFACT_PATH})`,
  async run(args, io) {
    const { values } = parseArgs({
      args,
      options: {
        dir: { type: 'string', default: DEFAULT_KNOWLEDGE_BASE_DIR },
        out: { type: 'string', default: DEFAULT_ARTIFACT_PATH },
      },
    });
    const dir = path.resolve(io.cwd, values.dir);
    const out = path.resolve(io.cwd, values.out);

    // Embeddings model and API key come from LUZIA_EMBEDDING_PROVIDER / LUZIA_EMBEDDING_MODEL.
    const { knowledgeBase, report } = await buildKnowledgeBaseWithReport({ dir, env: io.env ?? process.env });
    await writeCompiledKnowledgeBase(knowledgeBase, out);

    const parts = [`Core (${knowledgeBase.core.source})`];
    if (knowledgeBase.instructions) parts.push(`Instructions (${knowledgeBase.instructions.source})`);
    io.stdout(`Compiled Knowledge Base: ${parts.join(', ')}`);
    io.stdout(`Files processed: ${report.files.length} (${report.files.join(', ')})`);
    io.stdout(
      knowledgeBase.embeddingModel
        ? `Chunks produced: ${report.chunks}, embedded with ${knowledgeBase.embeddingModel}`
        : 'Chunks produced: 0 (no retrievable content, so no embeddings needed)',
    );
    io.stdout(`PDF pages extracted: ${report.pdfPages}`);
    for (const warning of report.warnings) io.stderr(`Warning: ${warning}`);
    io.stdout(`Wrote ${path.relative(io.cwd, out) || out}`);
    return 0;
  },
};
