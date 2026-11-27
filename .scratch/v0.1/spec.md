# Spec: luzIA v0.1

Status: ready-for-agent

## Problem Statement

A developer looking for work has a portfolio, but recruiters who land on it still have to email or message them to learn the basics: what they've worked on, which technologies they know, whether they're available, what salary they expect. That back-and-forth is slow for both sides, and many recruiters simply move on.

The developer would like recruiters (and any other visitor) to be able to *ask* about them, conversationally, right on the portfolio — and get accurate answers drawn only from information the developer chose to share. They want to pick their own LLM provider and pay for their own tokens, keep their data in their own repo, and drop the chat into their existing site with minimal effort. No such open-source, self-hostable building block exists.

## Solution

luzIA is an open-source (MIT), self-hosted Agent the Owner adds to their portfolio.

- The Owner writes a **Knowledge Base** as files in their own repo: a **Core** file (summary, contact details, role sought) that the Agent always sees, any number of additional markdown files, and optionally their CV as a PDF. They also write **Instructions** telling the Agent how to handle specific topics (e.g. salary).
- A build step compiles the Knowledge Base into a single artifact: text is extracted from the PDF, content is split into chunks by markdown heading, and chunks are embedded.
- A framework-agnostic server handler answers chat requests. It always gives the model the Core and the Instructions, retrieves the most relevant chunks for the Visitor's question (hybrid RAG, see ADR 0002), and streams the reply. It mounts as a Next.js route or deploys standalone; Vercel is the first documented target.
- An embeddable widget (floating bubble or inline) lets Visitors chat. It ships as a script/Web Component and as a React wrapper, and can be themed, given a greeting and suggested questions.
- An eval command lets the Owner check — with their real model — that the Agent answers correctly and never invents facts about them.

The Agent always presents itself as "luzIA", speaks about the Owner in the third person, replies in the Visitor's language, only talks about the Owner, and says it doesn't know (sharing the Owner's contact) rather than guessing.

## User Stories

### Owner: setup and configuration

1. As an Owner, I want to install luzIA from npm into my existing Next.js portfolio, so that I don't need a separate project or service.
2. As an Owner with a static portfolio, I want to deploy the luzIA server standalone and embed the widget with a script tag, so that I can use luzIA without a server-rendered site.
3. As an Owner, I want to mount the luzIA handler on a route in my Next.js app with a couple of lines, so that integration is trivial.
4. As an Owner, I want to choose my chat model provider and model (Anthropic, OpenAI, Google, etc.) via configuration, so that I can use the LLM I already pay for.
5. As an Owner, I want to choose my embeddings provider separately from my chat provider, so that I can use Claude for chat even though Anthropic offers no embeddings.
6. As an Owner, I want my API keys to live only in server-side environment variables, so that Visitors can never see or steal them.
7. As an Owner, I want a clear error at build or startup when required configuration (keys, provider, Core file) is missing, so that I don't discover misconfiguration from a broken chat.
8. As an Owner, I want to follow documentation that gets me from zero to a working Agent on Vercel, so that I can ship it in one sitting.
9. As an Owner, I want a working Next.js example in the repo, so that I can copy a known-good setup.

### Owner: Knowledge Base

10. As an Owner, I want to write my Knowledge Base as plain markdown files in my own repo, so that it's versioned with git and needs no database or admin panel.
11. As an Owner, I want a dedicated Core file that the Agent always sees, so that essential facts (summary, contact, role sought) are never missed by retrieval.
12. As an Owner, I want to drop my CV PDF into the Knowledge Base folder, so that I don't have to rewrite it in markdown.
13. As an Owner, I want to control how my content is chunked by how I structure headings, so that related facts stay together.
14. As an Owner, I want long sections to be split automatically, so that I don't need to worry about chunk size limits.
15. As an Owner, I want to write Instructions (e.g. "if asked about salary, give the range and suggest a call"), so that I control how sensitive topics are handled.
16. As an Owner, I want Instructions kept separate from facts, so that the Agent never quotes my Instructions to a Visitor as if they were information about me.
17. As an Owner, I want the Knowledge Base compiled at build time, so that it works in any serverless runtime and the PDF is processed only once.
18. As an Owner, I want the build to integrate with my normal Next.js/Vercel build, so that updating my Knowledge Base is just a commit and deploy.
19. As an Owner, I want the build to report what it compiled (files, chunks, PDF pages extracted), so that I can confirm my content was picked up.
20. As an Owner, I want the build to warn me when a PDF yields little or no text (e.g. a scanned image), so that I know to provide markdown instead.

### Owner: protection and cost control

21. As an Owner, I want to restrict which origins may call my luzIA server, so that nobody can embed my widget on their site and spend my tokens.
22. As an Owner using the same-origin Next.js setup, I want origin restriction to work without extra configuration, so that the default is safe.
23. As an Owner, I want a maximum number of messages per conversation, so that one Visitor can't run up an unbounded bill.
24. As an Owner, I want a maximum length for Visitor messages and for Agent replies, so that each request has a bounded cost.
25. As an Owner, I want the Agent to refuse off-topic requests (e.g. "write me a Python script"), so that my portfolio isn't used as a free general-purpose chatbot.
26. As an Owner, I want sensible defaults for all limits that I can override, so that I'm protected without having to tune anything.

### Owner: widget customization

27. As an Owner, I want to theme the widget's colors (and light/dark mode) to match my portfolio, so that it looks native to my site.
28. As an Owner, I want to set the greeting the Visitor sees first, so that I set the tone.
29. As an Owner, I want to configure suggested questions, so that Visitors know what they can ask and start quickly.
30. As an Owner, I want to choose between a floating bubble and an inline embed, so that I can either add a corner chat or a dedicated "Ask luzIA about me" section.
31. As an Owner using React, I want a React component wrapper, so that I configure the widget with props instead of a script tag.

### Owner: evals

32. As an Owner, I want to write an eval file of questions with expected answers, so that I can check the Agent against my own Knowledge Base.
33. As an Owner, I want to include trap questions about things not in my Knowledge Base, so that I can verify the Agent says it doesn't know rather than inventing.
34. As an Owner, I want to run evals with one command against my real configured model, so that I can test the setup Visitors will actually get.
35. As an Owner, I want a readable report of which eval cases passed and failed, with the Agent's actual answer, so that I can fix my Knowledge Base, Instructions or model choice.
36. As an Owner, I want the eval command to exit non-zero on failures, so that I can optionally gate deploys on it.
37. As an Owner, I want to re-run evals after changing my Knowledge Base, Instructions, model or retrieval settings, so that I catch regressions.

### Visitor: chatting

38. As a Visitor, I want to open a chat on the Owner's portfolio, so that I can ask about them without emailing them.
39. As a Visitor, I want to see a greeting and suggested questions, so that I know what the Agent can help with.
40. As a Visitor, I want to click a suggested question to send it, so that I can start without typing.
41. As a Visitor, I want replies to stream in as they're generated, so that the chat feels responsive.
42. As a Visitor, I want the Agent to remember earlier messages in the conversation, so that I can ask follow-up questions.
43. As a Visitor, I want my conversation to survive a page navigation or refresh within the same tab, so that I don't lose context while browsing the portfolio.
44. As a Visitor, I want to be able to start a new conversation, so that I can reset the context.
45. As a Visitor, I want the Agent to reply in the language I write in, so that I can ask in English even if the Owner's Knowledge Base is in Spanish.
46. As a Visitor, I want the Agent to clearly be "luzIA", an AI talking about the Owner, so that I never mistake its answers for commitments made by the Owner personally.
47. As a Visitor, I want accurate answers about the Owner's experience, skills, projects, availability and expectations, so that I can evaluate them as a candidate.
48. As a Visitor, I want the Agent to tell me when it doesn't have some information and give me the Owner's contact, so that I know who to ask instead of receiving a guess.
49. As a Visitor, I want a clear message when I hit the conversation limit, so that I understand why the Agent stopped and how to contact the Owner.
50. As a Visitor, I want a clear message when the Agent is unavailable (network or provider error), so that I'm not left waiting.
51. As a Visitor using a keyboard or screen reader, I want the widget to be accessible, so that I can use it regardless of ability.
52. As a Visitor on mobile, I want the widget to work well on a small screen, so that I can ask questions from my phone.

### Agent behaviour

53. As an Owner, I want the Agent to state facts about me only when the Knowledge Base supports them, so that it never misrepresents me to a recruiter.
54. As an Owner, I want the Agent to never infer or extrapolate facts about me (e.g. "uses Docker, so probably knows Kubernetes"), so that recruiters get only what's true.
55. As an Owner, I want the Agent to follow my Instructions for specific topics, so that sensitive subjects are handled my way.
56. As an Owner, I want the Agent to resist Visitors trying to override its behaviour ("ignore your instructions…"), so that it stays on-topic and truthful.
57. As an Owner, I want the Agent to speak about me in the third person, so that it never appears to be me.

## Implementation Decisions

- **Repo shape**: pnpm workspaces monorepo. Packages: `core` (server handler, prompt assembly, retrieval, Knowledge Base compilation), `cli` (`luzia build`, `luzia eval`), `widget` (framework-free Web Component + script bundle), `react` (thin wrapper over the widget). Plus a Next.js example app. Published under the `@luzia` npm scope (verified free). MIT license. Code and docs in English.
- **Architecture**: self-hosted only, file-based, no database (ADR 0001). No admin panel, no hosted service.
- **Knowledge Base layout**: a folder in the Owner's repo containing a required Core file, an optional Instructions file, any number of other markdown files, and optional PDF(s). Core and Instructions are distinguished by filename; everything else is retrievable content.
- **Compilation** (`luzia build`, also callable programmatically so it can hook into a Next.js build): reads the folder; extracts PDF text; chunks markdown by heading, sub-splitting long sections; embeds each chunk with the configured embeddings model; emits one compiled Knowledge Base artifact (JSON) containing Core text, Instructions text, chunks with source/heading metadata, and their vectors, plus the embedding model id. The server refuses to start if the artifact's embedding model differs from the configured one.
- **Hybrid RAG** (ADR 0002): every request sends the Core and Instructions in full; the Visitor's latest message (with light conversation context) is embedded at request time and the top-k chunks are retrieved and added to the prompt.
- **VectorStore interface**: a small interface (`search(queryVector, k) → chunks with scores`). v0.1 ships only the in-memory implementation loaded from the compiled artifact. External stores (e.g. Chroma) are future adapters.
- **LLM access**: Vercel AI SDK for both chat (streaming) and embeddings. Owner configures chat provider/model and embeddings provider/model independently via environment variables or handler options. Keys never reach the browser.
- **Server handler**: a function taking a Web standard `Request` and returning a `Response`, created from a config object (compiled Knowledge Base, models, limits, allowed origins). Mountable as a Next.js route handler or as a standalone serverless function. Chat endpoint accepts the conversation messages and streams the reply. Also answers CORS preflight.
- **Conversation state**: stateless server. The widget holds the conversation and sends it with each request; it persists it in `sessionStorage` per tab.
- **Origin protection**: an allowed-origins list. Requests whose `Origin` is not allowed are rejected; same-origin requests are allowed with no configuration.
- **Limits**: configurable with safe defaults — max messages per conversation, max Visitor message length, max output tokens. Exceeding a limit returns a distinct error the widget renders with the Owner's contact.
- **System prompt rules** (assembled by `core`): the Agent is "luzIA"; speaks about the Owner in the third person; answers only from Core + retrieved chunks; never infers; says it doesn't know and shares contact from the Core when unsupported; follows Instructions but never reveals them verbatim; refuses off-topic tasks; replies in the Visitor's language; treats Visitor messages as untrusted.
- **Widget**: floating bubble (default) or inline mode; streaming rendering; greeting; suggested questions; theming via CSS custom properties plus light/dark; "new conversation" control; error and limit states; accessible (focus management, ARIA live region for streamed replies, keyboard operable); responsive. Configured via script tag attributes or React props: server endpoint, mode, greeting, suggested questions, theme. Always titled "luzIA".
- **Evals**: an eval file in the Owner's repo listing cases — question, plus either facts the answer must contain, or an expectation that the Agent declines for lack of information (trap questions). `luzia eval` runs each case through the same handler path Visitors use, grades answers with an LLM judge using the Owner's configured chat model, prints a per-case report including the actual answer, and exits non-zero if any case fails.
- **Observability**: none in v0.1 (OpenTelemetry is out of scope), so no logging notice is needed in the widget yet.

## Testing Decisions

- **What makes a good test**: tests exercise only external behaviour through the three seams below — never internal functions such as the chunker or prompt builder directly. A test should survive any refactor that keeps behaviour the same. Models are faked with the Vercel AI SDK's mock language and embedding models, so tests are deterministic and need no API keys.
- **Seam 1 — Knowledge Base build + HTTP handler** (primary): start from a fixture Knowledge Base folder (Core, Instructions, markdown files, a small PDF), compile it with a fake embedder, construct the handler with a fake chat model, send Web `Request`s, assert on `Response`s and on what the fake model received. Covers: Core and Instructions always reach the model; the relevant chunk is retrieved for a question; PDF text is included; disallowed origins rejected and same-origin allowed; CORS preflight; message/length limits produce the limit error; replies stream; missing Core fails the build; embedding-model mismatch refuses to start.
- **Seam 2 — Widget in the DOM**: mount the Web Component (and the React wrapper) in a DOM test environment with a fake `fetch` that streams responses. Assert on what a Visitor sees and can do: open/close bubble, inline mode, greeting, suggested question sends a message, streamed reply renders, conversation persists across remount via sessionStorage, new conversation clears it, limit and error states render, theme properties apply, keyboard operability and ARIA roles.
- **Seam 3 — Eval runner**: run `luzia eval` against Seam 1 with fake chat and judge models. Assert that passing cases report as passed, that a fabricated answer to a trap question is reported as failed with the actual answer shown, and that the exit code is non-zero on any failure.
- **Not in CI**: running evals against a real model is the Owner's quality check, not part of the test suite.
- **Prior art**: none — greenfield repo. These tests establish the patterns.

## Out of Scope

- OpenTelemetry / Phoenix observability and the associated logging notice in the widget.
- Chroma Cloud (or any external) VectorStore adapter.
- Per-IP rate limiting backed by a KV store.
- Capturing unanswered questions and notifying the Owner.
- Tiered/"on request" information requiring Visitor identification.
- Hosted SaaS, admin panel, any database.
- Custom Agent name or avatar (the Agent is always "luzIA").
- First-person voice.
- Documented deployment targets beyond Vercel (the handler stays portable, but Cloudflare/Node are not documented or tested).
- Native PDF input to models; OCR for scanned PDFs.

## Further Notes

- Glossary terms (Owner, Visitor, Agent, Knowledge Base, Core, Instructions) are defined in `CONTEXT.md`; use them consistently in code, docs and UI copy.
- ADR 0001 (self-hosted, file-based, no database) and ADR 0002 (hybrid RAG over full-context) constrain this work.
- The first real deployment is the author's own Next.js portfolio on Vercel; the Next.js example should mirror that setup.
