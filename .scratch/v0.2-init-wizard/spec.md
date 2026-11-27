# Spec: luzIA v0.2 — `luzia init` setup wizard

Status: ready-for-agent

## Problem Statement

Setting up luzIA today means reading the README and doing everything by hand: creating the Knowledge Base folder, writing a Core and Instructions from scratch, picking chat and embeddings providers and model ids, finding the right environment variable names, adding the server route and widget to the portfolio, wiring `luzia build` into the build, and copying every variable into Vercel. Each step is easy to get slightly wrong (a mistyped variable, an embeddings model that doesn't match the build, a contact in the widget that differs from the Core), and the effort puts off exactly the Owners who would benefit most — people who want a working Agent on their portfolio, not a configuration project.

Owners also misunderstand where things live: they assume their information is uploaded somewhere, or that their API keys end up in the repo.

## Solution

A single interactive command, `npx luzia init`, run in the Owner's own portfolio project, walks them from nothing to a working Agent:

1. Detects the project: a Next.js app gets luzIA integrated in place; anything else gets a standalone server set up plus the `<script>` snippet for a static portfolio.
2. Asks for the chat provider/model and the embeddings provider/model, and the API keys, and saves them to `.env.local` (making sure it is git-ignored). Keys are never written anywhere else in the project.
3. Asks for the Owner's CV PDF, warns that its text will be sent to their chosen provider, and drafts a Core from it with their chat model — using only what the CV states. It asks for anything the draft is missing, shows the draft, and saves it only after the Owner confirms or edits it. The CV itself is added to the Knowledge Base for retrieval.
4. Asks how to handle sensitive topics (salary, availability, relocation, plus free text) and writes the Instructions.
5. Configures the widget: contact taken from the Core, a proposed greeting and suggested questions drawn from the CV, theme and mode chosen by the Owner.
6. Runs `luzia build`, and offers to upload the environment variables to Vercel when the project is linked with the Vercel CLI, or prints them for the dashboard otherwise.

Running it again shows what already exists and offers a per-section menu; it never overwrites a file without showing the difference and asking.

Everything stays file-based and self-hosted (ADR 0001): the wizard only writes files in the Owner's project and runs commands the Owner confirms.

## User Stories

### Starting

1. As an Owner, I want to run one command in my portfolio project to set up luzIA, so that I don't have to follow a long README by hand.
2. As an Owner, I want the wizard to explain in one sentence where my information and keys will live (Knowledge Base files in my repo, keys only in `.env.local` and my hosting provider), so that I understand what I'm agreeing to.
3. As an Owner, I want the wizard to warn me that Knowledge Base files are visible to anyone if my repo is public, so that I don't expose something I consider private.
4. As an Owner, I want to cancel at any step without leaving my project half-modified, so that trying the wizard is safe.
5. As an Owner, I want clear progress through the steps, so that I know how much is left.

### Project detection and integration

6. As an Owner with a Next.js portfolio, I want the wizard to detect it and integrate luzIA in place, so that the Agent runs inside my existing site.
7. As an Owner with a Next.js portfolio, I want the wizard to add the luzIA server route (handling chat and CORS preflight), so that I don't write it myself.
8. As an Owner with a Next.js portfolio, I want the wizard to add the widget to my site's layout, showing me the exact change before applying it, so that nothing in my code changes without my approval.
9. As an Owner, I want the wizard to install the luzIA packages with the package manager my project already uses, so that my lockfile stays consistent.
10. As an Owner, I want the wizard to make the Knowledge Base build run before my dev and build scripts, showing me the change to my scripts first, so that updating my Knowledge Base is just commit and deploy.
11. As an Owner with a static portfolio (or no recognised framework), I want the wizard to set up a standalone luzIA server instead, so that I can still use luzIA.
12. As an Owner with a static portfolio, I want the wizard to ask for my portfolio's domain and configure it as an allowed origin, so that only my site can use my server.
13. As an Owner with a static portfolio, I want the wizard to print the `<script>` tag and `<luzia-widget>` snippet with my options filled in, so that I can paste it into my HTML.

### Models and keys

14. As an Owner, I want to choose my chat provider from the supported list (Anthropic, OpenAI, Google, Groq), so that I can use the LLM I already pay for or a free one.
15. As an Owner, I want suggested model ids for my chosen provider, with the option to type another, so that I don't have to look them up.
16. As an Owner, I want to choose my embeddings provider separately (OpenAI or Google), with a short explanation of why it's needed and that Anthropic and Groq don't offer embeddings, so that I'm not confused by a second key.
17. As an Owner, I want to be asked only for the API keys my chosen providers need, and to reuse a key when chat and embeddings share a provider, so that I don't enter anything twice.
18. As an Owner, I want my keys typed without being echoed on screen, so that they don't end up in screenshots or terminal recordings.
19. As an Owner, I want my keys and model choices saved to `.env.local`, so that they never reach my repository.
20. As an Owner, I want the wizard to make sure `.env.local` is git-ignored (adding it if needed), so that I can't accidentally commit my keys.
21. As an Owner whose project already has an `.env.local`, I want the wizard to update only the luzIA variables and keep my other variables, so that nothing else in my setup breaks.

### Core from the CV

22. As an Owner, I want to point the wizard at my CV PDF, so that I don't have to write my Core from scratch.
23. As an Owner, I want to be told that my CV's text will be sent to my chosen chat provider before it happens, and to be able to decline, so that I stay in control of my data.
24. As an Owner who declines, or has no CV, I want to write my Core by answering questions instead, so that I can still finish setup.
25. As an Owner, I want the draft Core to contain only facts stated in my CV, so that the Agent never starts from invented information about me.
26. As an Owner, I want the draft to cover a short summary, my contact details and the role I'm looking for, so that the Agent always knows the essentials.
27. As an Owner, I want the wizard to ask me for essentials the CV doesn't state (e.g. role sought, availability, work mode, preferred contact), so that the Core is complete.
28. As an Owner, I want to see the full draft before it is saved and either accept it, edit it in my editor, or redo a part, so that the Core says exactly what I want.
29. As an Owner, I want my CV added to the Knowledge Base, so that the Agent can answer detailed questions from it through retrieval.
30. As an Owner, I want a clear message if the CV has little or no extractable text (e.g. a scanned image), with the option to continue with questions, so that a bad PDF doesn't block me.
31. As an Owner, I want a clear message if drafting fails because a key or model is wrong, naming the provider and variable, and the chance to fix the key and retry, so that I can recover without restarting.

### Instructions

32. As an Owner, I want to choose how the Agent handles salary (give a range I provide, suggest a call, or not discuss it), so that sensitive topics are handled my way.
33. As an Owner, I want to set how the Agent handles availability and relocation questions, so that common recruiter questions get my preferred answer.
34. As an Owner, I want to add any free-form guidance, so that I can cover topics the wizard doesn't ask about.
35. As an Owner, I want to see the resulting Instructions before they are saved, so that I know exactly what guidance the Agent follows.

### Widget

36. As an Owner, I want the widget's contact filled in from my Core automatically, so that the two never disagree.
37. As an Owner, I want a proposed greeting and three suggested questions based on my CV, which I can accept or edit, so that Visitors know what to ask.
38. As an Owner, I want to choose the widget theme (auto, light, dark) and mode (bubble or inline), so that it fits my portfolio.

### Build and production

39. As an Owner, I want the wizard to run `luzia build` at the end and show the build report, so that I know my Knowledge Base compiled correctly.
40. As an Owner whose project is linked with the Vercel CLI, I want to be offered to upload my luzIA environment variables to Vercel, confirming before anything is sent, so that production works without copying values by hand.
41. As an Owner whose project isn't linked to Vercel, I want the list of variables to set in my hosting dashboard (names and which values to use, without printing secrets), so that I can finish deployment myself.
42. As an Owner, I want a final summary of what was created and changed, how to start the dev server, and how to run `luzia eval`, so that I know what to do next.

### Running it again

43. As an Owner with an existing luzIA setup, I want the wizard to detect what's already configured and offer a menu (models and keys, Core, Instructions, widget, production variables), so that I can change one thing without redoing everything.
44. As an Owner, I want the wizard never to overwrite an existing file without showing me the difference and asking, so that my manual edits are safe.
45. As an Owner who changes the embeddings model, I want the wizard to rebuild the Knowledge Base, so that the server doesn't refuse to start over a model mismatch.

### Non-interactive use

46. As an Owner (or a CI job) without a terminal, I want `luzia init` to fail with a clear message instead of hanging, so that scripts don't stall.

## Implementation Decisions

- **Command**: `luzia init`, a new command in the CLI's existing command registry, runnable via `npx luzia init` once `@luzia/cli` is published. It requires an interactive terminal and exits with a clear error otherwise.
- **Architecture fit**: consistent with ADR 0001 — the wizard only reads and writes files in the Owner's project and runs local commands (package install, `luzia build`, `vercel env add`) after confirmation. No hosted service, no database.
- **Injected dependencies for testability**: the CLI's `io` gains three injectable collaborators, with real implementations used by the binary:
  - a **prompter** (text, secret input without echo, select, confirm, multi-line edit / open-in-editor, diff-and-confirm),
  - the **chat model** used for drafting (resolved from the Owner's choices by default, injectable for tests),
  - a **command runner** for external commands (package manager install, Vercel CLI detection and `vercel env add`).
  A maintained terminal-prompt library may back the real prompter (check current versions); the wizard logic depends only on the prompter interface.
- **Project detection**: Next.js is detected from the project's `package.json` dependencies and an App Router directory; the package manager from the lockfile present. Anything else takes the standalone path.
- **Next.js integration**: install `@luzia/core`, `@luzia/cli` and `@luzia/react`; create the server route exporting chat and preflight handlers; add the React widget to the root layout via a shown-and-confirmed change; prefix the `dev` and `build` scripts with `luzia build` via a shown-and-confirmed change. If the root layout can't be modified safely, print the exact snippet instead of guessing.
- **Standalone integration**: scaffold a standalone server matching the existing standalone example, set allowed origins from the Owner's portfolio domain(s), and print the script-tag snippet with the chosen widget options.
- **Providers**: chat providers and embeddings providers are read from core's existing provider tables (single source of truth), so the wizard offers exactly what the server supports. Each provider has a short list of suggested model ids defined alongside it; free text is always allowed.
- **Keys**: saved without validation (an explicit decision). Written only to `.env.local`, merging luzIA variables into an existing file and keeping others. `.env.local` is added to `.gitignore` if not already ignored. Secrets are never printed back.
- **Core drafting**: CV text is extracted with the existing PDF reader. After an explicit consent prompt naming the provider, the Owner's chat model drafts the Core with a dedicated drafting prompt: use only facts stated in the CV, never infer, mark missing essentials explicitly. The wizard asks for missing essentials, then shows the full draft for accept / edit / redo. The CV is copied into the Knowledge Base. A drafting failure shows the provider and variable involved and offers to re-enter the key and retry, or to switch to the questions path.
- **Core without CV**: a questions path (name, summary, experience highlights, contact, role sought, availability, work mode) produces the Core with no model call.
- **Instructions**: generated from topic answers (salary: range / call / don't discuss; availability; relocation; free text) using fixed templates, no model call. Shown before saving.
- **Widget configuration**: contact taken from the Core; greeting and three suggested questions proposed by the chat model from the drafted Core (or fixed defaults on the questions path), editable; theme and mode chosen. Written into the widget props (Next.js) or the printed snippet (standalone).
- **Production variables**: if the Vercel CLI is available and the project linked, offer to run `vercel env add` for each luzIA variable after one confirmation listing the variable names and target environments; otherwise print the variable names with where each value comes from, without secrets.
- **Re-run**: detect existing Knowledge Base, `.env.local` luzIA variables, route and widget; show a per-section menu. Every file write goes through a single "write file" step that shows a diff for existing files and requires confirmation. Changing the embeddings model triggers a rebuild.
- **Cancellation**: answers are gathered per step and files written at the end of each step only after confirmation; cancelling (Ctrl+C or a cancel choice) before a step's confirmation leaves that step's files untouched, and the summary lists what was already written.

## Testing Decisions

- **What makes a good test**: tests drive the whole command as an Owner would and assert on observable outcomes only — files present and their content, what the terminal showed, which external commands were requested — never on internal step functions. A refactor that keeps behaviour must keep tests green.
- **Single seam**: `runCli(['init'], io)` on a temporary project directory, with a scripted prompter (a queue of answers, failing the test on an unexpected or unanswered question), the existing fake chat model from the AI SDK test utilities for deterministic drafting, and a fake command runner recording requested commands (package install, Vercel CLI detection, `vercel env add`).
- **Project fixtures**: a minimal Next.js App Router project, an empty folder (standalone path), and a project with an existing luzIA setup (re-run menu). A small fixture CV PDF reuses the deterministic PDF fixture approach already in core's tests.
- **Coverage**: Next.js integration end to end (route, layout change confirmed, scripts updated, packages installed with the detected manager); standalone path (server scaffold, allowed origins, printed snippet); keys only in `.env.local`, merged with existing variables, git-ignored, never echoed in output; CV consent declined → questions path; Core draft contains only what the fake model returns and is written only after acceptance; drafting failure → key re-entry and retry; Instructions from each salary choice; widget contact equals the Core contact; Vercel upload only after confirmation, and printed list when not linked; re-run menu changes one section and shows a diff before overwriting; embeddings model change triggers rebuild; non-interactive terminal fails fast; cancel mid-way leaves later files untouched.
- **Prior art**: the CLI tests (`runCli` with an `io` object and temporary directories) and the eval command's Seam 3 tests with injected fake models; core's deterministic PDF fixture generator.
- **Not tested**: real provider calls, the real Vercel CLI, and the real terminal-prompt library rendering.

## Out of Scope

- Validating API keys with a test call (keys are saved as given).
- A local web studio (`luzia studio`) and any online admin panel (would require revisiting ADR 0001).
- Integrations for frameworks other than Next.js (Astro, Remix, etc.) beyond the standalone path.
- Hosting providers other than Vercel for uploading variables.
- Writing additional Knowledge Base markdown files from the CV beyond the Core (the CV itself is retrieved via RAG).
- Translating the wizard's own UI (English only for v0.2).

## Further Notes

- Use glossary terms (Owner, Visitor, Agent, Knowledge Base, Core, Instructions) in the wizard's on-screen copy.
- The drafting prompt carries the same "only stated facts, never infer" bar as the Agent; the Owner's review is the final safeguard.
- This resolves the v0.1 review finding that the widget contact was configured separately from the Core.
- The wizard must not write any AI-attribution text into the Owner's project.
