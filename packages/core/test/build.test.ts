import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, KnowledgeBaseError } from '../src/index.ts';
import { createFakeEmbeddingModel } from './support/fake-embedding-model.ts';
import { fixturePath } from './support/http.ts';

async function knowledgeBaseFolder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'luzia-kb-'));
  await writeFile(path.join(dir, 'core.md'), '# Ada\n\nAda is a backend engineer.');
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text);
  return dir;
}

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

  it('chunks non-Core markdown by heading, keeping source, heading path, vectors and the embedding model id', async () => {
    const embedder = createFakeEmbeddingModel();

    const kb = await buildKnowledgeBase({ dir: fixturePath('with-documents'), embedding: { model: embedder.model } });

    expect(kb.embeddingModel).toBe('fake:fake-embedding');
    expect(kb.chunks.map(({ source, headings }) => ({ source, headings }))).toEqual([
      { source: 'experience.md', headings: ['Experience', 'Northwind Payments'] },
      { source: 'experience.md', headings: ['Experience', 'Northwind Payments', 'Ledger migration'] },
      { source: 'experience.md', headings: ['Experience', 'Contoso Bank'] },
      { source: 'hobbies.md', headings: ['Hobbies'] },
      { source: 'hobbies.md', headings: ['Hobbies', 'Music'] },
      { source: 'salary.md', headings: ['Salary expectations'] },
    ]);
    expect(kb.chunks[1]?.text).toContain('Go services running on Kubernetes');
    expect(kb.chunks[1]?.text).not.toContain('Contoso');
    for (const chunk of kb.chunks) expect(chunk.vector.length).toBeGreaterThan(0);
  });

  it('never chunks the Core or the Instructions', async () => {
    const kb = await buildKnowledgeBase({
      dir: fixturePath('with-documents'),
      embedding: { model: createFakeEmbeddingModel().model },
    });

    const chunkText = kb.chunks.map((chunk) => chunk.text).join('\n');
    expect(chunkText).not.toContain('eight years of experience');
    expect(chunkText).not.toContain('If asked about salary');
  });

  it('sub-splits sections over the size limit, every piece keeping its heading path', async () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `Paragraph ${i}: ${'detail '.repeat(30).trim()}.`);
    const dir = await knowledgeBaseFolder({ 'projects.md': `# Projects\n\n## Ledger\n\n${paragraphs.join('\n\n')}` });

    const kb = await buildKnowledgeBase({ dir, embedding: { model: createFakeEmbeddingModel().model }, maxChunkChars: 500 });

    expect(kb.chunks.length).toBeGreaterThan(1);
    for (const chunk of kb.chunks) {
      expect(chunk.headings).toEqual(['Projects', 'Ledger']);
      expect(chunk.text.length).toBeLessThanOrEqual(500 + 'Projects > Ledger\n\n'.length);
    }
    const allText = kb.chunks.map((chunk) => chunk.text).join('\n');
    for (const paragraph of paragraphs) expect(allText).toContain(paragraph);
  });

  it('keeps text before the first heading and ignores headings inside code blocks', async () => {
    const dir = await knowledgeBaseFolder({
      'notes.md': 'Intro without heading.\n\n# Setup\n\n```sh\n# not a heading\nmake\n```',
    });

    const kb = await buildKnowledgeBase({ dir, embedding: { model: createFakeEmbeddingModel().model } });

    expect(kb.chunks.map((chunk) => chunk.headings)).toEqual([[], ['Setup']]);
    expect(kb.chunks[1]?.text).toContain('# not a heading');
  });

  it('ignores files it cannot read as Knowledge Base content', async () => {
    const dir = await knowledgeBaseFolder({ 'photo.png': 'binary', '.DS_Store': 'x' });

    const kb = await buildKnowledgeBase({ dir, env: {} });

    expect(kb.chunks).toEqual([]);
    expect(kb.embeddingModel).toBeNull();
  });

  it('builds a Core-only Knowledge Base with no embeddings model configured', async () => {
    const kb = await buildKnowledgeBase({ dir: fixturePath('knowledge-base'), env: {} });

    expect(kb.chunks).toEqual([]);
    expect(kb.embeddingModel).toBeNull();
  });

  it('fails with a clear message when there is content to embed but no embeddings model', async () => {
    const build = buildKnowledgeBase({ dir: fixturePath('with-documents'), env: {} });

    await expect(build).rejects.toThrow(KnowledgeBaseError);
    await expect(build).rejects.toThrow(/experience\.md.*no embeddings model.*LUZIA_EMBEDDING_PROVIDER.*LUZIA_EMBEDDING_MODEL/s);
  });

  it('reads the embeddings provider and model from the environment', async () => {
    const env = { LUZIA_EMBEDDING_PROVIDER: 'google', LUZIA_EMBEDDING_MODEL: 'gemini-embedding-001' };

    await expect(buildKnowledgeBase({ dir: fixturePath('with-documents'), env })).rejects.toThrow(
      /Missing API key.*GOOGLE_GENERATIVE_AI_API_KEY/,
    );
    await expect(
      buildKnowledgeBase({ dir: fixturePath('with-documents'), env: { ...env, LUZIA_EMBEDDING_PROVIDER: 'anthropic' } }),
    ).rejects.toThrow(/Unknown embeddings provider "anthropic".*openai, google/s);
  });
});
