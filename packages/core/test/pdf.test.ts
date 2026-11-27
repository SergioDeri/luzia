import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeBase, buildKnowledgeBaseWithReport, createLuziaHandler, KnowledgeBaseError } from '../src/index.ts';
import { createFakeChatModel } from './support/fake-chat-model.ts';
import { createFakeEmbeddingModel } from './support/fake-embedding-model.ts';
import { chatRequest, fixturePath } from './support/http.ts';

describe('CV as a PDF', () => {
  it('gives the model text that lives only in a PDF of the Knowledge Base', async () => {
    const embedder = createFakeEmbeddingModel();
    const knowledgeBase = await buildKnowledgeBase({ dir: fixturePath('with-pdf'), embedding: { model: embedder.model } });
    const chat = createFakeChatModel(['ok']);
    const handler = createLuziaHandler({
      knowledgeBase,
      chat: { model: chat.model },
      embedding: { model: embedder.model },
      retrieval: { topK: 1 },
      env: {},
    });

    const response = await handler(chatRequest([{ role: 'user', content: 'Has Ada worked with Java?' }]));
    await response.text();

    const system = (chat.prompts.at(-1) ?? []).filter((m) => m.role === 'system').map((m) => m.text).join('\n');
    expect(system).toContain('maintained the card ledger, written in Java');
    expect(system).toContain('cv.pdf');
    expect(system).not.toContain('cello');
  });

  it('attributes one chunk per PDF page to the PDF and reports what the build compiled', async () => {
    const { knowledgeBase, report } = await buildKnowledgeBaseWithReport({
      dir: fixturePath('with-pdf'),
      embedding: { model: createFakeEmbeddingModel().model },
    });

    const pdfChunks = knowledgeBase.chunks.filter((chunk) => chunk.source === 'cv.pdf');
    expect(pdfChunks).toHaveLength(2);
    expect(pdfChunks[0]?.text).toContain('built Go services running on Kubernetes');
    expect(pdfChunks[1]?.text).toContain('Speaks Spanish, English and Portuguese');
    expect(report).toEqual({ files: ['core.md', 'cv.pdf', 'hobbies.md'], chunks: 3, pdfPages: 2, warnings: [] });
  });

  it('warns, without failing, when a PDF has little or no extractable text, suggesting markdown', async () => {
    const { knowledgeBase, report } = await buildKnowledgeBaseWithReport({ dir: fixturePath('with-scanned-pdf'), env: {} });

    expect(knowledgeBase.chunks).toEqual([]);
    expect(report.pdfPages).toBe(1);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/scan\.pdf.*little or no extractable text.*markdown/s);
  });

  it('fails with a clear message naming a PDF it cannot read', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'luzia-kb-'));
    await writeFile(path.join(dir, 'core.md'), '# Ada');
    await writeFile(path.join(dir, 'cv.pdf'), 'not really a pdf');

    const build = buildKnowledgeBase({ dir, env: {} });

    await expect(build).rejects.toThrow(KnowledgeBaseError);
    await expect(build).rejects.toThrow(/cv\.pdf/);
  });
});
