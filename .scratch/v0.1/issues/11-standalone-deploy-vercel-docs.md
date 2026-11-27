# 11: Standalone deployment and Vercel docs

**What to build:** An Owner can go from zero to a working luzIA on their portfolio by following the README: either inside a Next.js app on Vercel (with the Knowledge Base build hooked into the normal Next.js build) or as a standalone server deployment plus a `<script>` tag for static portfolios.

**Blocked by:** 02 — Minimal widget; 04 — RAG; 05 — CV PDF extraction and build report; 06 — Protection: allowed origins, CORS and limits; 08 — Widget customization and inline mode; 10 — Evals

**Status:** ready-for-agent

- [ ] The widget ships as a single script bundle usable via a `<script>` tag on any site
- [ ] The handler can be deployed standalone as a serverless function, with allowed origins configured for the portfolio's domain
- [ ] The Knowledge Base build runs as part of the Next.js build so updating the Knowledge Base is commit + deploy
- [ ] README documents both paths on Vercel end to end: Knowledge Base layout (Core, Instructions, markdown, PDF), provider/embeddings configuration, environment variables, limits, origins, widget options and `luzia eval`
- [ ] README uses the glossary terms from CONTEXT.md and contains no AI-assistance attribution
- [ ] The Next.js example matches the documented setup
