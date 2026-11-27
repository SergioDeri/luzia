import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, KnowledgeBaseError } from '../src/index.ts';
import { fixturePath } from './support/http.ts';

describe('Knowledge Base build', () => {
  it('fails with a clear message when the Core file is missing', async () => {
    const build = buildKnowledgeBase({ dir: fixturePath('missing-core') });

    await expect(build).rejects.toThrow(KnowledgeBaseError);
    await expect(build).rejects.toThrow(/No Core file found.*core\.md/s);
  });

  it('fails with a clear message when the folder does not exist', async () => {
    await expect(buildKnowledgeBase({ dir: fixturePath('does-not-exist') })).rejects.toThrow(
      /Knowledge Base folder not found/,
    );
  });
});
