# luzIA example: Next.js on Vercel

A Next.js portfolio with luzIA mounted as a route and the widget on the home page. See the [root README](../../README.md#quick-start-nextjs-on-vercel) for the full walkthrough.

```
app/api/luzia/route.ts   the handler: POST (chat) and OPTIONS (CORS preflight)
app/page.tsx             the page, with <LuziaWidget> from @luzia/react
knowledge-base/          the Owner's Knowledge Base (core.md, instructions.md)
luzia.evals.json         eval cases for `luzia eval`
.env.example             copy to .env.local and fill in
```

- `pnpm dev` and `pnpm build` run `luzia build` first, which compiles `knowledge-base/` into `.luzia/knowledge-base.json` (imported by the route). On Vercel the `build` script runs on every deploy, so updating the Knowledge Base is commit and push.
- The widget calls `/api/luzia` on the same origin, so no allowed origins are configured.
- `pnpm eval` compiles the Knowledge Base and runs `luzia eval` against your real model.

Inside this monorepo the luzIA packages are linked from source (`workspace:*`, compiled through `transpilePackages`). In your own app, install them from npm and drop `transpilePackages`: `pnpm add @luzia/core @luzia/react` and `pnpm add -D @luzia/cli`.
