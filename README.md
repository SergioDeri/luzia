# luzIA

luzIA is an open-source, self-hosted AI agent you embed in your portfolio, so Visitors (often recruiters) can ask about you and get accurate answers without having to contact you first.

You are the **Owner**. You write a **Knowledge Base** as files in your own repo: a **Core** file the Agent always sees (summary, contact details, role sought), any number of other markdown files, and optionally your CV as a PDF. You also write **Instructions** that tell the Agent how to handle specific topics, such as salary. A build step compiles the Knowledge Base into one JSON artifact. A small server handler answers chat requests with the LLM provider and API key you choose, and a widget lets Visitors chat with the Agent on your site.

The Agent always presents itself as "luzIA". It speaks about the Owner in the third person, replies in the Visitor's language, only talks about the Owner, and says it doesn't know (and shares the Owner's contact) rather than guessing.

| Package | What it is |
| --- | --- |
| [`luzia-core`](packages/core) | Server handler (Web `Request` in, streamed `Response` out) and Knowledge Base compiler |
| [`luzia-cli`](packages/cli) | `luzia init` (setup wizard), `luzia build` (compile the Knowledge Base) and `luzia eval` (check the Agent's answers) |
| [`luzia-widget`](packages/widget) | `<luzia-widget>` Web Component, also shipped as a single script bundle |
| [`luzia-react`](packages/react) | `<LuziaWidget>` React wrapper over the widget |

The quickest way to set it up is **[`npx luzia init`](#quick-start-npx-luzia-init)**, run in your portfolio project. It covers both kinds of portfolio:

- **Next.js**: the handler is a route in your Next.js portfolio. Same origin, no CORS setup.
- **Static portfolios** (GitHub Pages, plain HTML, any other framework): the handler is deployed on its own as a Vercel Function, and your site loads the widget with a `<script>` tag.

If you prefer to do it by hand, the [manual setup](#manual-setup) covers both, for Vercel. Working examples: [`examples/nextjs`](examples/nextjs) and [`examples/standalone`](examples/standalone).

## Contents

- [Quick start: `npx luzia init`](#quick-start-npx-luzia-init)
- [Where your data and keys live](#where-your-data-and-keys-live)
- [Manual setup](#manual-setup)
  - [Next.js on Vercel](#manual-setup-nextjs-on-vercel)
  - [Standalone server and a script tag](#manual-setup-standalone-server-and-a-script-tag)
- [Knowledge Base](#knowledge-base)
- [Chat and embeddings models](#chat-and-embeddings-models)
- [Environment variables](#environment-variables)
- [Limits](#limits)
- [Allowed origins](#allowed-origins)
- [Widget](#widget)
- [React](#react)
- [Evals: `luzia eval`](#evals-luzia-eval)
- [Handler options](#handler-options)
- [Architecture](#architecture)
- [Developing luzIA](#developing-luzia)

## Quick start: `npx luzia init`

Run the setup wizard in your portfolio project, in a terminal. It asks questions as it goes, so it needs an interactive terminal; from a script or CI job it stops with an error instead of waiting.

```sh
cd my-portfolio
npx luzia init
```

It works out what kind of project it is in:

- **A Next.js app** (a `next` dependency and an `app/` or `src/app/` folder): luzIA is added to the app in place, with a server route at `/api/luzia` and the widget in your root layout.
- **Anything else** (a static portfolio, or an empty folder): the folder is set up as a standalone luzIA server to deploy on Vercel, and the wizard prints the `<script>` snippet to paste into your portfolio's HTML.

Then it walks you through:

1. **Models and keys**: the chat provider and model, the embeddings provider and model (OpenAI or Google), and their API keys, saved to `.env.local`.
2. **Core**: drafted from your CV PDF with your chat model (only after you agree to send the CV's text to that provider), or written from a few questions with no model call. You see the full Core and accept it, edit it, or redo it.
3. **Instructions**: how the Agent handles salary, availability, relocation and anything else you add.
4. **Widget**: the greeting, three suggested questions, the theme and the mode (bubble or inline).
5. **Integration**: for Next.js, the packages, the server route, the widget in the root layout and `luzia build` before your `dev` and `build` scripts; for a static portfolio, the server files, your portfolio's domains as allowed origins, and the widget snippet.
6. **Build**: runs `luzia build` and shows what it compiled.
7. **Production variables**: uploads the variables to your Vercel project with `vercel env add` when the folder is linked to one, or lists the names to set in your hosting provider's settings.

Nothing in your project changes without your say-so: every file it creates or updates (with a diff for existing files) and every command it runs is shown first and needs your confirmation. It ends with a summary of what changed, anything left to do by hand, and next steps. Run it again later to change one part of the setup at a time. The [CLI README](packages/cli/README.md#luzia-init) describes every step in detail.

## Where your data and keys live

luzIA has no hosted service and no database. Everything stays with you:

- **Your Knowledge Base is files in your own repo** (`knowledge-base/`: Core, Instructions, your CV and any other files). The Agent may share anything in it with Visitors, and **if the repo is public, anyone can read those files there too**. Use a private repo, or leave sensitive details out of the Knowledge Base and use Instructions to say how the Agent should handle the topic (for example, "suggest discussing salary on a call").
- **Your API keys live only in `.env.local`** on your machine (`luzia init` makes sure it is git-ignored and never prints the keys back) **and in your hosting provider's environment variables** in production. They are read on the server only and never reach the browser.
- **Your CV's text is sent to the chat provider you chose**, and only when you ask `luzia init` to draft your Core from it and agree to send it. Once the Agent is running, your chosen providers do the work they are there for: `luzia build` sends the retrievable Knowledge Base content to your embeddings provider, and each Visitor question goes to your embeddings provider (to search) and your chat provider (with the Core, Instructions and the relevant parts of the Knowledge Base, to answer). Nothing is sent anywhere else.

## Manual setup

The same setup by hand, for Vercel.

### Manual setup: Next.js on Vercel

This mirrors [`examples/nextjs`](examples/nextjs).

**1. Install the packages** in your Next.js app:

```sh
pnpm add luzia-core luzia-react
pnpm add -D luzia-cli
```

**2. Write your Knowledge Base** in a `knowledge-base/` folder at the app root. A `core.md` is all you need to start (see [Knowledge Base](#knowledge-base)):

```
knowledge-base/
  core.md            # required: summary, contact details, role sought
  instructions.md    # optional: how the Agent handles specific topics
```

**3. Compile the Knowledge Base as part of every build.** Run `luzia build` before `next dev` and `next build`, so updating the Knowledge Base is just a commit and a deploy:

```json
{
  "scripts": {
    "dev": "luzia build && next dev",
    "build": "luzia build && next build",
    "start": "next start"
  }
}
```

`luzia build` reads `knowledge-base/` and writes `.luzia/knowledge-base.json`. It is a build output, so add `.luzia/` to your `.gitignore`.

**4. Mount the handler** on a route, e.g. `app/api/luzia/route.ts`:

```ts
import { createLuziaHandler, loadCompiledKnowledgeBase } from 'luzia-core';
// Generated by `luzia build`, which the `dev` and `build` scripts run first.
import compiledKnowledgeBase from '../../../.luzia/knowledge-base.json';

const handler = createLuziaHandler({
  knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase),
});

export const POST = handler;
// Answers CORS preflight, in case you also embed the widget on another site.
export const OPTIONS = handler;
```

The chat model and API key come from environment variables, so nothing secret lives in code. The widget calls this route from the same origin, so no [allowed origins](#allowed-origins) are needed.

**5. Add the widget** to a page or your root layout:

```tsx
import { LuziaWidget } from 'luzia-react';

export default function Home() {
  return (
    <main>
      <h1>Jamie Rivera</h1>
      <LuziaWidget
        endpoint="/api/luzia"
        contact="jamie.rivera@example.com"
        greeting="Hi! I'm luzIA, an AI agent that answers questions about Jamie. What would you like to know?"
        suggestedQuestions={['What role is Jamie looking for?', 'Is Jamie open to remote work?']}
      />
    </main>
  );
}
```

**6. Configure the environment.** Locally, put the variables in `.env.local` (both Next.js and the `luzia` CLI read it):

```sh
LUZIA_CHAT_PROVIDER=anthropic
LUZIA_CHAT_MODEL=claude-sonnet-5-5
ANTHROPIC_API_KEY=sk-ant-...
# Only once knowledge-base/ has files besides core.md and instructions.md:
# LUZIA_EMBEDDING_PROVIDER=openai
# LUZIA_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_API_KEY=sk-...
```

Run `pnpm dev` and open the luzIA bubble in the corner.

**7. Deploy to Vercel.** Import the repo in Vercel (framework preset: Next.js; the default build command runs your `build` script, which runs `luzia build` first). In *Project Settings → Environment Variables*, add the same variables as in `.env.local`. Vercel exposes them both to the build and to the functions, and both need them: `luzia build` uses the embeddings settings, and `next build` loads the route, which checks the chat settings and fails the build with a clear message if one is missing.

From then on, editing the Knowledge Base is commit, push, and Vercel redeploys with the recompiled Knowledge Base.

### Manual setup: standalone server and a script tag

For a static portfolio, deploy the handler on its own as a Vercel Function and embed the widget with a script tag. This mirrors [`examples/standalone`](examples/standalone).

**1. Create a server project** (a new repo or a folder in your portfolio repo deployed as its own Vercel project):

```
luzia-server/
  api/luzia.ts       # the Vercel Function
  knowledge-base/
    core.md
    instructions.md
  public/index.html  # any placeholder page
  package.json
  vercel.json
```

```sh
pnpm add luzia-core
pnpm add -D luzia-cli
```

**2. `package.json`**: Vercel runs the `build` script, which compiles the Knowledge Base.

```json
{
  "type": "module",
  "scripts": {
    "build": "luzia build"
  }
}
```

**3. `api/luzia.ts`**: the handler is a Web-standard `Request → Response` function, which Vercel runs as-is. Allow your portfolio's origin, since the widget calls the server from another domain:

```ts
import { readFileSync } from 'node:fs';
import { createLuziaHandler, loadCompiledKnowledgeBase } from 'luzia-core';

const compiledKnowledgeBase = JSON.parse(
  readFileSync(new URL('../.luzia/knowledge-base.json', import.meta.url), 'utf8'),
);

const handler = createLuziaHandler({
  knowledgeBase: loadCompiledKnowledgeBase(compiledKnowledgeBase),
  allowedOrigins: ['https://jamie.example.com', 'https://www.jamie.example.com'],
});

export const POST = handler;
export const OPTIONS = handler; // CORS preflight
```

You can leave `allowedOrigins` out and set `LUZIA_ALLOWED_ORIGINS=https://jamie.example.com,https://www.jamie.example.com` instead.

**4. `vercel.json`**: ship the compiled Knowledge Base with the function.

```json
{
  "outputDirectory": "public",
  "functions": {
    "api/luzia.ts": { "includeFiles": ".luzia/**" }
  }
}
```

**5. Deploy.** Import the project in Vercel (framework preset: Other), add the [environment variables](#environment-variables) in *Project Settings → Environment Variables*, and deploy. Your endpoint is `https://<your-project>.vercel.app/api/luzia`.

**6. Embed the widget** in your portfolio's HTML. The script bundle registers `<luzia-widget>` as soon as it loads:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/luzia-widget/dist/luzia-widget.js"></script>

<luzia-widget
  endpoint="https://<your-project>.vercel.app/api/luzia"
  contact="jamie.rivera@example.com"
  greeting="Hi! I'm luzIA, an AI agent that answers questions about Jamie."
  suggested-questions='["What role is Jamie looking for?", "Is Jamie open to remote work?"]'
></luzia-widget>
```

Pin a version in production (`luzia-widget@<version>`), or self-host the file: it is a single file with no dependencies, found at `node_modules/luzia-widget/dist/luzia-widget.js` (also exported as `luzia-widget/script`).

## Knowledge Base

The Knowledge Base is a folder of files (by default `knowledge-base/`, next to `package.json`). It is the only source of facts the Agent may state about the Owner, and **everything in it is public**: Visitors can ask about any of it, so only put in what you are happy to share.

| File | Role |
| --- | --- |
| `core.md` (required) | The **Core**: always given to the Agent in full. Put your summary, contact details and the role you are looking for here. Contact details here are what the Agent shares when it doesn't know an answer. |
| `instructions.md` (optional) | Your **Instructions**: how the Agent should handle specific topics. They shape behaviour, are not facts, and are never quoted to Visitors. |
| any other `.md` / `.markdown` | Retrievable content: experience, projects, skills, FAQs. The Agent sees the parts relevant to each question. |
| `.pdf` files | Your CV (or other documents). Text is extracted at build time and treated like the markdown files. |

File names are matched case-insensitively (`CORE.md` works). Only files directly in the folder are read; subfolders are ignored.

A minimal example:

```md
<!-- knowledge-base/core.md -->
# Jamie Rivera

Jamie Rivera is a full-stack developer based in Valencia, Spain, with six years of experience building web products with TypeScript, React and Node.js.

## Role sought

A senior full-stack or frontend role, remote or hybrid in Valencia, available from next month.

## Contact

- Email: jamie.rivera@example.com
- GitHub: https://github.com/example
```

```md
<!-- knowledge-base/instructions.md -->
If asked about salary expectations, say Jamie prefers to discuss compensation on a call and share the contact email.
```

```md
<!-- knowledge-base/experience.md -->
# Experience

## Acme (2022 to now)

Senior frontend engineer on the checkout team. Led the migration from Angular to React.

## Northwind (2019 to 2022)

Full-stack developer on internal tools (Node.js, PostgreSQL).
```

**How content is split.** Markdown files other than Core and Instructions are split into chunks by heading: each heading starts a chunk, which keeps its full heading path (`Experience > Acme (2022 to now)`). Structure your headings so that related facts stay together. Sections longer than about 1,200 characters are split automatically at paragraph, then sentence boundaries. PDF text is split by page.

**PDFs.** Drop your CV PDF into the folder. If a PDF yields little or no text (for example a scanned image), the build warns you: luzIA cannot read images, so add that content as markdown instead.

**Building.** `luzia build [--dir knowledge-base] [--out .luzia/knowledge-base.json]` compiles the folder and reports what it picked up:

```
Compiled Knowledge Base: Core (core.md), Instructions (instructions.md)
Files processed: 4 (core.md, instructions.md, cv.pdf, experience.md)
Chunks produced: 7, embedded with openai.embedding:text-embedding-3-small
PDF pages extracted: 2
Wrote .luzia/knowledge-base.json
```

The build fails with a clear message when `core.md` is missing, or when there is retrievable content but no embeddings model configured. A Core-only Knowledge Base needs no embeddings at all. The compiler is also available programmatically as `buildKnowledgeBase` / `buildKnowledgeBaseWithReport` from `luzia-core`.

**How the Agent uses it** (hybrid RAG): every request sends the Core and the Instructions in full; the Visitor's latest message (plus their previous one, for context) is embedded and the 4 most relevant chunks are added to the prompt. So essential facts in the Core are never missed by retrieval.

## Chat and embeddings models

luzIA uses the [Vercel AI SDK](https://ai-sdk.dev), and you choose two models independently: the **chat model** that writes the Agent's replies, and the **embeddings model** that searches the Knowledge Base.

| | Providers | API key variable |
| --- | --- | --- |
| Chat (`LUZIA_CHAT_PROVIDER`) | `anthropic`, `openai`, `google`, `groq` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` |
| Embeddings (`LUZIA_EMBEDDING_PROVIDER`) | `openai`, `google` | `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` |

The model id (`LUZIA_CHAT_MODEL`, `LUZIA_EMBEDDING_MODEL`) is any model the provider offers, e.g. `claude-sonnet-5-5` for chat or `text-embedding-3-small` for OpenAI embeddings.

**Chatting with Claude or a Groq model needs a second key.** Anthropic and Groq have no embeddings API, so if you chat with one of them and your Knowledge Base has retrievable content (anything besides Core and Instructions), you also need an OpenAI or Google key for embeddings (`luzia init` always asks for one):

```sh
LUZIA_CHAT_PROVIDER=anthropic
LUZIA_CHAT_MODEL=claude-sonnet-5-5
ANTHROPIC_API_KEY=sk-ant-...
LUZIA_EMBEDDING_PROVIDER=openai
LUZIA_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-...
```

**Build and server must use the same embeddings model.** The compiled Knowledge Base records the embeddings model it was built with, and the server refuses to start if it is configured with a different one. After changing the embeddings model, rebuild.

**Keys stay on the server.** API keys are only read from server-side environment variables (or passed in code to the handler); they never reach the browser. A missing key fails at startup with a message naming the variable to set.

Instead of environment variables you can configure models in code, including any other AI SDK provider:

```ts
import { createLuziaHandler } from 'luzia-core';
import { createMistral } from '@ai-sdk/mistral';

createLuziaHandler({
  knowledgeBase,
  chat: { model: createMistral({ apiKey: process.env.MISTRAL_API_KEY })('mistral-large-latest') },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
});
```

A model passed in code to the handler is not seen by `luzia build`, which reads the embeddings model from the environment; keep both on the same model. For a custom embeddings provider, compile with `buildKnowledgeBase({ dir, embedding })` from your own script.

## Environment variables

All are read on the server only. `luzia build` and `luzia eval` read them too, and when run locally also load `.env.local` and `.env` from the current folder (real environment variables win).

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `LUZIA_CHAT_PROVIDER` | (required) | server, eval | `anthropic`, `openai`, `google` or `groq` |
| `LUZIA_CHAT_MODEL` | (required) | server, eval | Chat model id, e.g. `claude-sonnet-5-5` |
| `ANTHROPIC_API_KEY` | | server, eval | Key for the `anthropic` chat provider |
| `OPENAI_API_KEY` | | server, build, eval | Key for the `openai` chat or embeddings provider |
| `GOOGLE_GENERATIVE_AI_API_KEY` | | server, build, eval | Key for the `google` chat or embeddings provider |
| `GROQ_API_KEY` | | server, eval | Key for the `groq` chat provider (chat only; Groq has no embeddings) |
| `LUZIA_EMBEDDING_PROVIDER` | (none) | build, server, eval | `openai` or `google`. Required once the Knowledge Base has retrievable content |
| `LUZIA_EMBEDDING_MODEL` | (none) | build, server, eval | Embeddings model id, e.g. `text-embedding-3-small`. Set together with the provider |
| `LUZIA_ALLOWED_ORIGINS` | (none: same origin only) | server | Comma-separated origins allowed to call the server from another site |
| `LUZIA_MAX_MESSAGES` | `20` | server | Maximum Visitor messages per conversation |
| `LUZIA_MAX_MESSAGE_LENGTH` | `1000` | server | Maximum characters per Visitor message |
| `LUZIA_MAX_OUTPUT_TOKENS` | `600` | server | Maximum tokens per Agent reply |
| `LUZIA_MAX_REPLY_LENGTH` | 8 × max output tokens (`4800`) | server | Maximum characters per Agent reply sent back in the conversation |
| `LUZIA_MAX_REQUEST_BYTES` | `524288` (512 KiB) | server | Maximum request body size |

Values passed in code to `createLuziaHandler` take precedence over the environment.

## Limits

Each conversation and each request is bounded so one Visitor can't run up an unbounded bill. The defaults are safe; override them per setting.

| Limit | Default | Option | Variable | When exceeded |
| --- | --- | --- | --- | --- |
| Visitor messages per conversation | 20 | `limits.maxMessages` | `LUZIA_MAX_MESSAGES` | `429` `conversation_limit_reached` |
| Characters per Visitor message | 1000 | `limits.maxMessageLength` | `LUZIA_MAX_MESSAGE_LENGTH` | `413` `message_too_long` |
| Tokens per Agent reply | 600 | `limits.maxOutputTokens` | `LUZIA_MAX_OUTPUT_TOKENS` | the reply is cut at the limit |
| Characters per Agent reply sent back | 8 × `maxOutputTokens` (4800) | `limits.maxReplyLength` | `LUZIA_MAX_REPLY_LENGTH` | `413` `message_too_long` |
| Messages per conversation, both roles | 2 × `maxMessages` − 1 (39) | follows `maxMessages` | | `429` `conversation_limit_reached` |
| Request body size | 512 KiB | `limits.maxRequestBytes` | `LUZIA_MAX_REQUEST_BYTES` | `413` `request_too_large` |

```ts
createLuziaHandler({ knowledgeBase, limits: { maxMessages: 30, maxOutputTokens: 800 } });
```

Only Visitor messages count towards `maxMessages`; the conversation as a whole may hold at most `2 × maxMessages − 1` messages, the most an alternating conversation can have. The server is stateless, so earlier Agent replies arrive from the client with every request and could be forged: each one is capped at `maxReplyLength` characters, which by default follows `maxOutputTokens` (8 characters per token, well above what a reply of that many tokens holds). The body size is checked while the request is read, before it is parsed as JSON; if you raise the other limits a lot, raise `maxRequestBytes` too. Values must be positive whole numbers, or the server fails at startup. When a limit is hit, the widget tells the Visitor and shows the Owner's `contact`; it does the same when the Agent is unavailable (network or provider error). The Agent also refuses off-topic requests (such as "write me a Python script"), so your portfolio isn't a free general-purpose chatbot.

Error responses are JSON: `{ "error": { "code": "...", "message": "..." } }`. Besides the limit codes above: `400` `invalid_request`, `403` `origin_not_allowed`, `405` `method_not_allowed`, and `502` `provider_error` when the chat model fails before replying or the embeddings model fails while searching the Knowledge Base (a chat model failing mid-reply breaks the stream instead).

## Allowed origins

Only allowed origins may use your server, so nobody can embed your widget on their site and spend your tokens.

- **Same origin needs no configuration.** A widget served from the same site as the handler (the Next.js setup) always works. Requests without an `Origin` header (server-to-server calls, `luzia eval`) are accepted too.
- **Other origins must be allowed** with `allowedOrigins` or `LUZIA_ALLOWED_ORIGINS`. Each entry is a full origin: scheme, host and optional port, no path (`https://jamie.example.com`, `http://localhost:8080`). `www.` and the bare domain are different origins; list both if you use both.
- Requests from any other origin get `403` `origin_not_allowed`. Allowed origins get CORS headers on every response, and CORS preflight (`OPTIONS`) is answered, which is why the route also exports `OPTIONS`.

```ts
createLuziaHandler({ knowledgeBase, allowedOrigins: ['https://jamie.example.com'] });
```

Origin checks stop other websites from using your server through Visitors' browsers. They are not authentication: a script outside a browser can send any `Origin`. The limits are what bound the cost of each request.

**What this does not stop.** Origin checks and per-conversation limits keep other websites from embedding your widget and bound what each request can cost, but they do not stop scripted abuse: requests without an `Origin` header are accepted, and a script can simply start a new conversation every time it hits a limit. Set a spend limit (and usage alerts) with your chat and embeddings providers so a determined caller can't run up an unbounded bill. Per-IP rate limiting is planned.

## Widget

`<luzia-widget>` is a framework-free Web Component. By default it is a floating bubble in the bottom-right corner that opens a chat panel titled "luzIA". Replies stream in as they are generated. The conversation is kept in the tab's `sessionStorage`, so it survives page navigation and refreshes, and a "New conversation" button resets it.

| Attribute | React prop | Default | Description |
| --- | --- | --- | --- |
| `endpoint` | `endpoint` | (required) | URL of the luzIA handler, e.g. `/api/luzia` or `https://luzia-server.vercel.app/api/luzia` |
| `contact` | `contact` | (none) | How to reach the Owner (email, URL or short text), shown when a limit is hit or the Agent is unavailable |
| `greeting` | `greeting` | (none) | First message the Visitor sees. Display only, never sent to the server |
| `suggested-questions` | `suggestedQuestions` | (none) | Questions the Visitor can click to send, shown until the conversation starts. Attribute: a JSON array of strings; prop: an array |
| `mode` | `mode` | `bubble` | `bubble` (floating button that opens the chat) or `inline` (the chat rendered in place, always open, for a section such as "Ask luzIA about me") |
| `theme` | `theme` | `light` | `light`, `dark`, or `auto` to follow the Visitor's `prefers-color-scheme` |
| `avatar` | `avatar` | luzIA's icon | URL of an image shown large and centred at the top of the chat, like a video call, with the conversation below it (your photo, a logo…). It is shown whole, in its own shape (a PNG with a transparent background works best), and glows softly while luzIA is replying. Each reply appears in a speech bubble beside the picture as it streams in (luzIA stays on the left, so it never moves her), stays a few seconds after it ends (and for as long as the mouse is over it, going 2 seconds after the mouse leaves), then fades and joins the conversation below. A new reply moves the current one to the conversation at once. Long replies show from their beginning and scroll inside the bubble. Without one, luzIA's own icon is shown, in the theme's accent colours. Its height can be set with `--luzia-avatar-size` |

```html
<section id="ask">
  <h2>Ask luzIA about me</h2>
  <luzia-widget endpoint="/api/luzia" mode="inline" theme="auto"></luzia-widget>
</section>
```

### Theming

Colours and fonts are CSS custom properties. Set them on the element; your values win over both the light and the dark palettes.

| Variable | Default (light) | Styles |
| --- | --- | --- |
| `--luzia-accent` | `#4f46e5` | Bubble, header, Visitor messages, buttons |
| `--luzia-accent-contrast` | `#ffffff` | Text on the accent colour |
| `--luzia-surface` | `#ffffff` | Chat background |
| `--luzia-text` | `#18181b` | Chat text |
| `--luzia-muted` | `#f4f4f5` | Agent messages, greeting, suggested questions |
| `--luzia-border` | `#d4d4d8` | Input and inline-panel borders |
| `--luzia-font` | `system-ui, …` | Font family |
| `--luzia-inline-height` | `32rem` | Height of the chat in inline mode |

```css
luzia-widget {
  --luzia-accent: #0f766e;
  --luzia-font: 'Inter', sans-serif;
}
```

### Using the package instead of the script tag

With a bundler, import the package and register the element yourself:

```ts
import { defineLuziaWidget } from 'luzia-widget';

defineLuziaWidget(); // registers <luzia-widget>; safe to call more than once
```

## React

`luzia-react` wraps the widget with the same options as props (`suggestedQuestions` as an array). `className` and `style` go on the element, so theme variables can be set inline. It works in React Server Components pages (it is a client component) and registers the element in the browser.

```tsx
import { LuziaWidget } from 'luzia-react';

<LuziaWidget
  endpoint="/api/luzia"
  contact="jamie.rivera@example.com"
  mode="bubble"
  theme="auto"
  greeting="Hi! I'm luzIA. Ask me anything about Jamie."
  suggestedQuestions={['What role is Jamie looking for?', 'What is Jamie’s main tech stack?']}
  style={{ '--luzia-accent': '#0f766e' }}
/>;
```

## Evals: `luzia eval`

An eval file lets you check, with your real configured model, that the Agent answers correctly from your Knowledge Base and never invents facts about you. Write `luzia.evals.json` next to `package.json`:

```json
{
  "cases": [
    {
      "name": "experience",
      "question": "How many years of experience does Jamie have, and with which technologies?",
      "expectedFacts": ["Six years of experience", "TypeScript", "React", "Node.js"]
    },
    {
      "name": "salary instruction",
      "question": "What are Jamie's salary expectations?",
      "expectedFacts": ["Jamie prefers to discuss compensation on a call", "jamie.rivera@example.com"]
    },
    {
      "name": "trap: Kubernetes",
      "question": "Has Jamie worked with Kubernetes in production?",
      "trap": true
    }
  ]
}
```

Each case has a `question`, an optional `name`, and either:

- `expectedFacts`: a non-empty list of facts the answer must contain (in any wording or language), or
- `"trap": true`: the answer is *not* in the Knowledge Base, and the Agent must decline rather than guess.

Then run it after `luzia build`:

```sh
luzia build && luzia eval [--file luzia.evals.json] [--kb .luzia/knowledge-base.json]
```

Each case goes through the same handler path Visitors use, and is graded by an LLM judge using your configured chat model. The report shows every case with the Agent's actual answer and the judge's reason:

```
PASS  1. experience: How many years of experience does Jamie have, and with which technologies?
      Answer: Jamie has six years of experience, working with TypeScript, React and Node.js.
      Judge:  The answer states all four expected facts.

FAIL  3. trap: Kubernetes: Has Jamie worked with Kubernetes in production?
      Answer: Yes, Jamie has run Kubernetes clusters in production.
      Judge:  The Knowledge Base has no such fact; the answer invents one.

2 passed, 1 failed (3 cases)
```

`luzia eval` exits non-zero when any case fails, so you can gate deploys on it. A case whose reply errors or breaks off mid-stream is reported as failed with the error, and the run continues. Re-run it after changing your Knowledge Base, Instructions, model or retrieval settings. It calls your real model, so it costs tokens.

## Handler options

`createLuziaHandler(config)` returns `(request: Request) => Promise<Response>`. It validates everything eagerly, so misconfiguration fails at startup (or at build, in Next.js), not on the first chat.

| Option | Description |
| --- | --- |
| `knowledgeBase` | The compiled Knowledge Base from `luzia build`, checked with `loadCompiledKnowledgeBase` |
| `chat` | `{ provider, model, apiKey? }` or `{ model: <AI SDK language model> }`. Default: from `LUZIA_CHAT_*` |
| `embedding` | `{ provider, model, apiKey? }` or `{ model: <AI SDK embedding model> }`. Default: from `LUZIA_EMBEDDING_*` |
| `allowedOrigins` | Origins allowed from other sites. Default: from `LUZIA_ALLOWED_ORIGINS` |
| `limits` | `{ maxMessages?, maxMessageLength?, maxOutputTokens?, maxReplyLength?, maxRequestBytes? }`. Default: from the environment, else 20 / 1000 / 600 / 8 × `maxOutputTokens` / 512 KiB (see [Limits](#limits)) |
| `retrieval` | `{ topK?, vectorStore? }`. `topK` defaults to 4. `vectorStore` replaces the in-memory store (an object with `search(queryVector, k)`) |
| `env` | Where settings and keys are read from. Default: `process.env` |

The chat endpoint accepts `POST` with `{ "messages": [{ "role": "user" | "assistant", "content": "..." }] }` (the last message from the Visitor) and streams the reply as `text/plain`. The server is stateless: the widget sends the whole conversation with each request.

## Architecture

luzIA is self-hosted and file-based, with no database: your Knowledge Base lives in your repo, your API keys in your environment, and there is no luzIA service to sign up for ([ADR 0001](docs/adr/0001-self-hosted-file-based-no-database.md)). It uses hybrid RAG: the Core is always in the prompt and retrieval adds details, which is why embeddings need their own provider ([ADR 0002](docs/adr/0002-hybrid-rag-over-full-context.md)). Domain terms (Owner, Visitor, Agent, Knowledge Base, Core, Instructions) are defined in [CONTEXT.md](CONTEXT.md).

## Developing luzIA

Requires Node.js 22.18 or later and pnpm.

```sh
pnpm install
pnpm typecheck   # every package and example
pnpm test        # all tests; no API keys or network needed
pnpm build       # build the packages, including the widget script bundle
```

## License

[MIT](LICENSE)
