# 01: Tracer bullet: `luzia init` on Next.js with a Core from questions

**What to build:** An Owner runs `luzia init` in a Next.js portfolio and ends with a working Agent: the wizard explains where data and keys live (and warns that a public repo exposes the Knowledge Base), detects Next.js and the package manager, installs the luzIA packages, asks for chat and embeddings providers/models (offered from core's provider tables, with suggested model ids) and the needed API keys (secret input, shared keys asked once), writes them only to `.env.local` (merging with existing variables) and makes sure it is git-ignored, builds the Core from a questions path (no model call), creates the server route (chat + preflight), runs `luzia build` and prints a summary with next steps. Lays down the foundations the other tickets build on: injectable prompter, command runner and chat model on the CLI `io` (real implementations in the binary), a single write-file step that shows a diff and asks before touching an existing file, step-wise cancellation, a fail-fast check for non-interactive terminals, and the Seam test harness (`runCli(['init'], io)` on a temp project, scripted prompter that fails on unexpected questions, fake runner). See spec: Implementation Decisions (Command, Injected dependencies, Project detection, Next.js integration, Providers, Keys, Core without CV, Cancellation).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `luzia init` is registered in the CLI and fails fast with a clear message when not run in an interactive terminal
- [ ] Prompter, command runner and drafting chat model are injectable via the CLI `io`, with real implementations used by the binary
- [ ] Next.js App Router projects and their package manager (from the lockfile) are detected; luzIA packages are installed via the runner with that manager
- [ ] Chat and embeddings providers offered come from core's provider tables; each has suggested model ids and free text is allowed; Anthropic/Groq are not offered for embeddings, with a short explanation
- [ ] Only the keys the chosen providers need are asked, once per provider, without echo; secrets never appear in output
- [ ] luzIA variables are written only to `.env.local`, merged with existing non-luzIA variables; `.env.local` is added to `.gitignore` when not already ignored
- [ ] The questions path produces a Core with no model call
- [ ] The server route (chat + CORS preflight) is created; `luzia build` runs and its report is shown; a final summary lists created/changed files and next steps
- [ ] Every write to an existing file shows a diff and requires confirmation; cancelling before a step's confirmation leaves that step's files untouched
- [ ] Seam tests cover all of the above on a Next.js fixture project
