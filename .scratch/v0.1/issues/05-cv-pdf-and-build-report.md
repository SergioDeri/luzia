# 05: CV PDF extraction and build report

**What to build:** An Owner can drop their CV as a PDF into the Knowledge Base folder and the Agent answers questions from it, without rewriting it in markdown. The build extracts the PDF's text once, chunks and embeds it like the other content, warns when a PDF yields little or no text (e.g. a scanned image), and prints a summary of what it compiled.

**Blocked by:** 04 — RAG: heading-based chunking, embeddings and in-memory VectorStore

**Status:** ready-for-agent

- [ ] PDF text is extracted at build time and becomes retrievable chunks attributed to the PDF source
- [ ] Build warns when a PDF yields little or no extractable text, suggesting markdown instead
- [ ] Build prints a report: files processed, chunks produced, PDF pages extracted
- [ ] Seam 1 test with a small fixture PDF: a question about a fact only in the PDF results in that text reaching the model
