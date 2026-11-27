import type { CompiledKnowledgeBase, KnowledgeBaseChunk } from '../knowledge-base/compiled.ts';

export interface SystemPromptInput {
  knowledgeBase: CompiledKnowledgeBase;
  /** Chunks retrieved for the current Visitor question (hybrid RAG). */
  retrievedChunks: KnowledgeBaseChunk[];
}

/**
 * Assembles the system prompt sent to the chat model on every request.
 *
 * This is the single place where the Agent's behaviour rules, the Core, the
 * Owner's Instructions and retrieved chunks are combined.
 */
export function assembleSystemPrompt({ knowledgeBase, retrievedChunks }: SystemPromptInput): string {
  const sections = [
    'You are luzIA, an AI agent that answers questions from visitors about the Owner described below. ' +
      'Speak about the Owner in the third person.',
    section('core', knowledgeBase.core.text),
  ];

  if (knowledgeBase.instructions) {
    sections.push(section('owner_instructions', knowledgeBase.instructions.text));
  }

  if (retrievedChunks.length > 0) {
    sections.push(
      section(
        'knowledge_base_excerpts',
        retrievedChunks.map((chunk) => `Source: ${chunk.source}\n${chunk.text}`).join('\n\n---\n\n'),
      ),
    );
  }

  return sections.join('\n\n');
}

function section(tag: string, body: string): string {
  return `<${tag}>\n${body}\n</${tag}>`;
}
