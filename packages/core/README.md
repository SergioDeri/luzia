# @luzia/core

The luzIA server handler and Knowledge Base compiler.

```ts
import { createLuziaHandler, loadCompiledKnowledgeBase } from '@luzia/core';
import compiledKnowledgeBase from './.luzia/knowledge-base.json';

const handler = createLuziaHandler({ knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase) });

export const POST = handler; // Web Request in, streamed Response out
export const OPTIONS = handler; // CORS preflight
```

The handler is framework-agnostic: mount it as a Next.js route handler or deploy it as a standalone Vercel Function. Chat and embeddings models, allowed origins and limits come from handler options or `LUZIA_*` environment variables. The compiled Knowledge Base is produced by `luzia build` from [`@luzia/cli`](../cli), or by `buildKnowledgeBase` from this package.

See the [root README](../../README.md) for setup, configuration and every option.
