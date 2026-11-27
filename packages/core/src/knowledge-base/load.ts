import { LuziaConfigError } from '../errors.ts';
import { COMPILED_KNOWLEDGE_BASE_FORMAT, type CompiledKnowledgeBase } from './compiled.ts';

/**
 * Checks that `value` is a compiled Knowledge Base this version understands
 * (for example a JSON file imported by the host app) and returns it typed.
 */
export function loadCompiledKnowledgeBase(value: unknown): CompiledKnowledgeBase {
  const kb = value as Partial<CompiledKnowledgeBase> | null;
  if (!kb || typeof kb !== 'object' || typeof kb.core?.text !== 'string') {
    throw new LuziaConfigError(
      'The compiled Knowledge Base is missing or invalid. Run `luzia build` and pass its output as `knowledgeBase`.',
    );
  }
  if (kb.format !== COMPILED_KNOWLEDGE_BASE_FORMAT) {
    throw new LuziaConfigError(
      `The compiled Knowledge Base has format ${String(kb.format)}, but this version of luzIA expects ` +
        `format ${COMPILED_KNOWLEDGE_BASE_FORMAT}. Run \`luzia build\` again.`,
    );
  }
  return kb as CompiledKnowledgeBase;
}
