# Hybrid RAG instead of full-context prompting

A typical Knowledge Base (CV + a few pages) fits comfortably in a single prompt, so sending it whole would be simpler and avoids retrieval misses. We chose RAG anyway — partly as a deliberate learning goal, partly so luzIA scales to Owners with large Knowledge Bases (blogs, many projects). To limit the main risk (the agent saying "I don't know" when the fact exists but wasn't retrieved), essential sections are always sent in the prompt and retrieval only supplies details.

## Considered Options

- **Full Knowledge Base in the prompt**: simplest and most accurate for small Knowledge Bases; rejected for the reasons above.
- **Pure RAG**: rejected as too fragile for the "never claim ignorance of a real fact" bar.

## Consequences

- Embeddings need a provider separate from the chat model (Anthropic has no embeddings API), so a Claude Owner needs a second key.
- Embeddings are computed at build time and searched in memory by default behind a `VectorStore` interface; external stores (e.g. Chroma Cloud) are optional adapters.
