/** Raised at build time when the Knowledge Base folder cannot be compiled. */
export class KnowledgeBaseError extends Error {
  override name = 'KnowledgeBaseError';
}

/** Raised when the handler is created with missing or invalid configuration. */
export class LuziaConfigError extends Error {
  override name = 'LuziaConfigError';
}
