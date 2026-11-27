import { MockEmbeddingModelV4 } from 'ai/test';

/**
 * Keywords the fake embedding model knows. Each text becomes a bag-of-words
 * vector over this vocabulary, so texts sharing keywords are close.
 */
const VOCABULARY = [
  'kubernetes',
  'ledger',
  'go',
  'java',
  'card',
  'marathon',
  'cello',
  'orchestra',
  'salary',
  'eur',
  'payments',
] as const;

/**
 * A deterministic, offline embedding model that records every value it was
 * asked to embed.
 */
export function createFakeEmbeddingModel({ modelId = 'fake-embedding' }: { modelId?: string } = {}) {
  const model = new MockEmbeddingModelV4({
    provider: 'fake',
    modelId,
    doEmbed: async ({ values }) => ({ embeddings: values.map(embedText), warnings: [] }),
  });

  return {
    model,
    /** Every text the model embedded, in call order. */
    get embeddedValues() {
      return model.doEmbedCalls.flatMap((call) => call.values);
    },
  };
}

function embedText(text: string): number[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  // A small constant dimension keeps every vector non-zero.
  return [...VOCABULARY.map((term) => words.filter((word) => word === term || word === `${term}s`).length), 0.1];
}
