# 01: Tracer bullet: Core-only chat end to end over HTTP

**What to build:** An Owner can write a Core file (and optional Instructions), compile it with `luzia build`, and get streamed answers about themselves from the luzIA server handler mounted in the Next.js example — demoable with a plain HTTP request. This sets up the pnpm monorepo (`core`, `cli`, `widget`, `react` packages plus the Next.js example), the compiled Knowledge Base artifact, the framework-agnostic `Request → Response` handler, chat via the Vercel AI SDK with a configurable provider/model, and the Seam 1 test harness (fixture Knowledge Base folder, fake chat model). See spec: Implementation Decisions (Repo shape, Knowledge Base layout, Compilation, Server handler, LLM access).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] pnpm workspace with `core`, `cli`, `widget` and `react` packages under the `@luzia` scope, MIT license, and a Next.js example app
- [x] `luzia build` compiles a Knowledge Base folder containing a Core file and optional Instructions file into a single artifact; it is also callable programmatically
- [x] The build fails with a clear message when the Core file is missing
- [x] The handler is created from a config object (compiled Knowledge Base, chat model) and turns a Web `Request` carrying conversation messages into a streamed `Response`
- [x] Core and Instructions reach the model on every request (verified via the fake model in a Seam 1 test)
- [x] Chat provider and model are chosen via configuration; API keys are read server-side only, and a missing key produces a clear startup error
- [x] The Next.js example mounts the handler on a route and answers a request from the example's Knowledge Base
- [x] Seam 1 tests run with no API keys or network
