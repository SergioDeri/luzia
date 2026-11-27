# 04: RAG: heading-based chunking, embeddings and in-memory VectorStore

**What to build:** An Owner can add any number of markdown files to their Knowledge Base beyond the Core, and the Agent answers detailed questions using the most relevant parts of them. The build splits markdown into chunks by heading (sub-splitting long sections), embeds them with a separately configured embeddings provider/model, and stores the vectors in the compiled artifact. At request time the Visitor's question is embedded, the top-k chunks are retrieved from an in-memory `VectorStore`, and added to the prompt alongside the Core (hybrid RAG, ADR 0002).

**Blocked by:** 01 — Tracer bullet: Core-only chat end to end over HTTP

**Status:** done

- [x] Markdown files other than Core and Instructions are chunked by heading; sections over the size limit are sub-split
- [x] Chunks keep source file and heading metadata in the compiled artifact, together with their vectors and the embedding model id
- [x] Embeddings provider and model are configured independently of the chat provider
- [x] A `VectorStore` interface exists with an in-memory implementation loaded from the compiled artifact
- [x] Seam 1 test: a question about a fact that lives only in a non-Core file results in that chunk reaching the model, while the Core is still sent in full
- [x] The server refuses to start, with a clear message, when the artifact's embedding model differs from the configured one
- [x] Fake embedding model used in tests; no network required
